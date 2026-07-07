'use client';

import { useState } from 'react';

type DownloadType = 'video' | 'audio';

export default function Home() {
  const [url, setUrl] = useState('');
  const [type, setType] = useState<DownloadType>('video');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleDownload = async () => {
    if (!url.trim()) {
      setError('Please enter a valid media URL.');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      setSuccess(null);

      // Create object URL and download manually to handle streaming UI gracefully
      const response = await fetch(`/api/download?url=${encodeURIComponent(url)}&type=${type}`);

      if (!response.ok) {
        throw new Error('Failed to process download link. Check if the URL is valid and supported.');
      }

      // Get content disposition header to extract filename
      const contentDisposition = response.headers.get('content-disposition');
      let filename = `download.${type === 'video' ? 'mp4' : 'mp3'}`;

      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) {
          filename = match[1];
        }
      }

      // Stream the response into a blob
      const blob = await response.blob();
      const tempUrl = window.URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = tempUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(tempUrl);

      setSuccess(`Successfully downloaded ${filename}!`);
      setUrl(''); // Clear input

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An unexpected error occurred during download.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main>
      <h1>Universal Media Fisher</h1>
      <p className="subtitle">Seamless high-quality extractions.</p>

      <div className="glass-container">
        <div className="input-group">
          <label className="input-label" htmlFor="media-url">Media Link</label>
          <input
            id="media-url"
            type="text"
            className="styled-input"
            placeholder="Paste your YouTube or media link here..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={isLoading}
          />
        </div>

        <div className="controls-group">
          <div
            className={`toggle-option ${type === 'video' ? 'active' : ''}`}
            onClick={() => !isLoading && setType('video')}
          >
            Highest Quality MP4
          </div>
          <div
            className={`toggle-option ${type === 'audio' ? 'active' : ''}`}
            onClick={() => !isLoading && setType('audio')}
          >
            Highest Quality MP3
          </div>
        </div>

        <button
          className="download-btn"
          onClick={handleDownload}
          disabled={isLoading || !url.trim()}
        >
          {isLoading ? (
            <>
              <span className="loader"></span>
              Extracting...
            </>
          ) : (
            `Download ${type === 'video' ? 'Video' : 'Audio'}`
          )}
        </button>

        {error && (
          <div className="status-message error">
            {error}
          </div>
        )}

        {success && (
          <div className="status-message success">
            {success}
          </div>
        )}
      </div>
    </main>
  );
}
