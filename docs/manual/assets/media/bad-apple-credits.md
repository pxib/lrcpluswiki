# Bad Apple!!

`bad-apple.mp4` is a 320 × 240 H.264/AAC transcode of the shadow-art music video, bundled for the hidden text animation. It retains the supplied video's approximately 219-second timeline.

`bad-apple.webm` is a matching 320 × 240 VP8/Vorbis transcode for browser and VS Code preview compatibility. The player selects a supported format and retries the alternative if loading fails.

The background-brightness timeline embedded in `bad-apple.js` is derived from the MP4 at 10 samples per second, averaging the video's outer border. It drives the theme switcher without requiring live canvas pixel access. Regenerate it with `node tools/build-bad-apple-background.cjs`.

`bad-apple-frames.js` contains derived 96 × 72 luminance frames at 20 fps, quantized to sixteen brightness levels, packed two samples per byte and compressed with DEFLATE. The character renderer samples one brightness value for each intact glyph and uses the media clock for synchronization. Generate it with `node tools/build-bad-apple-frames.cjs`. These derived frames retain the underlying video's third-party rights.

Source copy: the supplied `Bad Apple!!.webm` in this directory, transcoded for broad browser compatibility.

Japanese captions: the user-supplied `badappleja.lrc`, embedded unchanged in `bad-apple-lyrics.js` by `tools/build-bad-apple-lyrics.cjs`. Cues span 27.39–205.98 seconds and include blank instrumental cues. The underlying song lyrics remain third-party material and are not covered by the repository's MIT license.

Korean captions: the user-supplied `badapplekr.lrc`, embedded unchanged under language key `ko` by the same generator. The translated lyrics remain third-party material and are not covered by the repository's MIT license.

Vietnamese and Chinese captions: the user-supplied `badapplevi.lrc` and `badapplezh.lrc`, embedded unchanged under `vi` and `zh-Hant`. The Chinese file includes pinyin in parentheses, displayed as a separate reading line. The translated lyrics and readings remain third-party material and are not covered by the repository's MIT license.

The original Chinese track is bundled under `zh-Hant`; its Simplified counterpart under `zh` is generated with OpenCC (`opencc-js` 1.4.2, https://github.com/nk2028/opencc-js). Pinyin and timing metadata are unchanged. The conversion library is a build dependency and is not shipped to readers.

Czech captions: the user-supplied `badapplecz.lrc`, based on the supplied reference [Bad Apple – CZ překlad, KagamineRinCZ](https://www.hryprodivky.cz/blog/kagaminerincz/bad-apple-cz-preklad). The existing Czech text, timestamps, and `-1300` ms offset are preserved. The final eight cues were translated from the user-provided Japanese text for this project, rather than copied from the reference. This is a translation draft awaiting Czech-language review. The underlying song lyrics and third-party translation retain their respective rights.

Cantonese captions: the user-supplied `badappleyue.lrc`, embedded unchanged under `yue` for Cantonese pages. Its Traditional text and timing are preserved. The adapted lyrics remain third-party material and are not covered by the repository's MIT license.

Original shadow-art video: https://www.nicovideo.jp/watch/sm8628149 (あにら / Anira).
Music arrangement and performance: Alstroemeria Records, arrangement by Masayoshi Minoshima, vocals by nomico, lyrics by Haruka; original composition by ZUN / Team Shanghai Alice.

This third-party video and music are not covered by this repository's MIT license. All rights remain with their respective creators. The source repository's license does not grant rights to the underlying video or music.

Transcode command:

```sh
ffmpeg -i "Bad Apple!!.webm" -vf scale=320:-2 -c:v libx264 -preset slow -crf 30 -pix_fmt yuv420p -c:a aac -b:a 64k -ac 1 -movflags +faststart bad-apple.mp4
ffmpeg -i "Bad Apple!!.webm" -vf scale=320:-2 -c:v libvpx -b:v 240k -crf 10 -deadline good -cpu-used 4 -pix_fmt yuv420p -c:a libvorbis -q:a 3 -ac 1 bad-apple.webm
```
