export function ObsQuickStart() {
  return <details className="creator-guide">
    <summary>How to use OBS · Apple Music · video playlists</summary>
    <div>
      <h3>Connect the controls</h3>
      <ol>
        <li>Open OBS Studio on this computer. In OBS 28 or later, WebSocket is included.</li>
        <li>Open <strong>Tools → WebSocket Server Settings</strong>, enable the server and keep authentication enabled.</li>
        <li>Copy its server address and password into the fields above, then choose <strong>Connect OBS</strong>. The usual local address is <code>ws://127.0.0.1:4455</code>.</li>
        <li>Choose your scene here. You can control the virtual camera, recording, streaming and an audio input by its exact OBS name.</li>
      </ol>
      <p>If the browser blocks the local connection, use the controls in OBS itself. This connection controls OBS; your scene and streaming destination are configured in OBS.</p>
      <h3>Play from the Music app on your Mac</h3>
      <ol>
        <li>Start your song or playlist in the Music app.</li>
        <li>With OBS 30+ on macOS 13+, add <strong>Sources → + → macOS Audio Capture</strong> and select the Music application. Grant the macOS recording permission if requested.</li>
        <li>Check that the source meter moves in the OBS audio mixer. Make a short recording and listen back before broadcasting.</li>
        <li>For video and audio together, configure your RTMP destination in <strong>OBS Settings → Stream</strong>. VC Node’s Telegram panel can provide its RTMP endpoint with <strong>Use VC Node RTMP</strong>.</li>
      </ol>
      <p>The Spotify widget controls Spotify listening devices. It does not control the native Music app or carry its audio. OBS Virtual Camera provides the scene’s video; audio needs its own route.</p>
      <h3>Use a video playlist or a sticker</h3>
      <p>For a playlist, install VLC and add a <strong>VLC Video Source</strong> in OBS. Add your videos and enable loop or shuffle as needed. For a sticker, add an <strong>Image</strong> source above the video and position it in a corner.</p>
      <p><a href="https://obsproject.com/kb/remote-control-guide" target="_blank" rel="noreferrer">OBS controls guide</a> · <a href="https://obsproject.com/kb/macos-desktop-audio-capture-guide" target="_blank" rel="noreferrer">Mac audio guide</a> · <a href="https://obsproject.com/kb/media-sources" target="_blank" rel="noreferrer">Video playlists</a></p>
    </div>
  </details>
}
