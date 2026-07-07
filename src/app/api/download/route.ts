import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const url = searchParams.get('url');
  const type = searchParams.get('type') || 'video';

  if (!url) {
    return NextResponse.json(
      { error: 'Media URL is required' },
      { status: 400 }
    );
  }

  // Set response headers for download
  const isAudio = type === 'audio';
  const ext = isAudio ? 'mp3' : 'mp4';
  const contentType = isAudio ? 'audio/mpeg' : 'video/mp4';

  try {
    // First, let's get the title of the video for the filename
    const titleProcess = spawn('yt-dlp', ['--get-title', url]);
    let title = 'download';
    
    // We'll just wait a very short time for title, if it fails we fallback
    const titlePromise = new Promise<string>((resolve) => {
      let output = '';
      titleProcess.stdout.on('data', (data) => output += data.toString());
      titleProcess.on('close', (code) => {
        if (code === 0 && output.trim()) {
          resolve(output.trim().replace(/[^a-zA-Z0-9]/g, '_')); 
        } else {
          resolve('download');
        }
      });
      // Timeout just in case
      setTimeout(() => resolve('download'), 2000);
    });
    
    title = await titlePromise;

    // Build the args
    // Use pipes since we stream to stdout
    let ytDlpArgs: string[] = [];
    
    if (isAudio) {
      ytDlpArgs = [
        url,
        '-x', 
        '--audio-format', 'mp3',
        '--audio-quality', '0',
        '-o', '-' 
      ];
    } else {
      ytDlpArgs = [
        url,
        '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        '--merge-output-format', 'mp4',
        '-o', '-' // Output to stdout
      ];
    }

    const child = spawn('yt-dlp', ytDlpArgs);

    // Create a ReadableStream from the child process stdout
    const stream = new ReadableStream({
        start(controller) {
            child.stdout.on('data', (chunk) => {
                controller.enqueue(chunk);
            });
            
            child.stderr.on('data', (data) => {
               // Log yt-dlp stderr for debugging (warnings/progress)
               console.log(`yt-dlp stderr: ${data.toString()}`);
            });

            child.on('close', (code) => {
                if (code !== 0) {
                    console.error(`yt-dlp process exited with code ${code}`);
                    // Can't really change status code if stream already started, 
                    // but we close the stream.
                }
                controller.close();
            });

            child.on('error', (err) => {
                console.error(`yt-dlp process error:`, err);
                controller.error(err);
            });
        },
        cancel() {
            // If the client aborts, kill the child process
            child.kill('SIGKILL');
        }
    });

    const headers = new Headers();
    headers.set('Content-Type', contentType);
    headers.set('Content-Disposition', `attachment; filename="${title}.${ext}"`);

    return new NextResponse(stream, { headers });

  } catch (error) {
    console.error('Download error:', error);
    return NextResponse.json(
      { error: 'Failed to process the download link' },
      { status: 500 }
    );
  }
}
