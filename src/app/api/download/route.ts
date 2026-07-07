import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { createReadStream } from 'fs';
import { unlink, stat } from 'fs/promises';
import { join } from 'path';
import os from 'os';

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

  const isAudio = type === 'audio';
  const ext = isAudio ? 'mp3' : 'mp4';
  const contentType = isAudio ? 'audio/mpeg' : 'video/mp4';

  try {
    // 1. Get the title for the filename
    const titleProcess = spawn('yt-dlp', ['--get-title', url]);
    let title = 'download';
    
    const titlePromise = new Promise<string>((resolve) => {
      let output = '';
      titleProcess.stdout.on('data', (data) => output += data.toString());
      titleProcess.on('close', (code) => {
        if (code === 0 && output.trim()) {
          resolve(output.trim().replace(/[^a-zA-Z0-9\u0400-\u04FF\s-]/g, '').trim()); 
        } else {
          resolve('download');
        }
      });
      setTimeout(() => resolve('download'), 3000); // 3s timeout
    });
    
    title = await titlePromise;

    // 2. Generate a temporary file path
    const tmpFileName = `${randomUUID()}.${ext}`;
    const tmpFilePath = join(os.tmpdir(), tmpFileName);

    // 3. Download the file using yt-dlp to the temporary path
    let ytDlpArgs: string[] = [];
    if (isAudio) {
      ytDlpArgs = [
        url,
        '-x', 
        '--audio-format', 'mp3',
        '--audio-quality', '0',
        '-o', tmpFilePath 
      ];
    } else {
      ytDlpArgs = [
        url,
        '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        '--merge-output-format', 'mp4',
        '-o', tmpFilePath
      ];
    }

    await new Promise((resolve, reject) => {
      const child = spawn('yt-dlp', ytDlpArgs);
      
      child.stderr.on('data', (data) => {
        console.log(`yt-dlp stderr: ${data.toString()}`);
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(null);
        } else {
          reject(new Error(`yt-dlp process exited with code ${code}`));
        }
      });

      child.on('error', (err) => {
        reject(err);
      });

      // If client disconnects while downloading to server
      req.signal.addEventListener('abort', () => {
        child.kill('SIGKILL');
        unlink(tmpFilePath).catch(() => {});
        reject(new Error('Request aborted by client'));
      });
    });

    // 4. Verify file exists and get size
    const fileStats = await stat(tmpFilePath);
    
    // 5. Create a ReadStream and convert it to Web ReadableStream
    const fileStream = createReadStream(tmpFilePath);
    const stream = new ReadableStream({
      start(controller) {
        fileStream.on('data', (chunk) => {
          controller.enqueue(chunk);
        });
        fileStream.on('end', () => {
          controller.close();
        });
        fileStream.on('error', (err) => {
          controller.error(err);
        });
      },
      cancel() {
        fileStream.destroy();
      }
    });

    // 6. Cleanup file when stream closes
    fileStream.on('close', () => {
      unlink(tmpFilePath).catch(err => console.error('Failed to delete temp file:', err));
    });

    const headers = new Headers();
    headers.set('Content-Type', contentType);
    headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(title)}.${ext}"`);
    headers.set('Content-Length', fileStats.size.toString());

    return new NextResponse(stream, { headers });

  } catch (error) {
    console.error('Download error:', error);
    return NextResponse.json(
      { error: 'Failed to process the download link' },
      { status: 500 }
    );
  }
}
