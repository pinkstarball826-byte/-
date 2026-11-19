# video_01 — 人間関係が疲れる原因は「境界線」だった

`spec.json` の台本・シーン定義から縦型動画(1080x1920 / 30fps / 75秒)を描画する。

- `src/renderer.js` — `draw(t)` で任意時刻のフレームを描く(キャラ・アイコン・図形・モーション・字幕)
- `index.html` — プレビュー(`node tools/render.mjs --serve` → http://localhost:8080 、セーフエリア表示つき)
- `tools/render.mjs` — Playwright でフレームを取り ffmpeg で `out/video_01.mp4` を出力
  - `node tools/render.mjs` 全編レンダリング
  - `node tools/render.mjs --stills 1.5,22` 指定秒のPNG
- 音声: `audio/scene_{id}.mp3`(各シーン開始時刻に配置)と `audio/bgm.mp3`(音量0.08)があれば自動で合成。なければ無音。
- 字幕はナレーション文を句読点で区切り、文字数比でシーン内に割り当てている。実音声に合わせて調整が必要なら `buildChunks` を差し替える。
