# Golden Wave · Remotion 复刻（Motion Face 示范）

一支 4 秒、1920×1080 / 30fps 的无音轨动效复刻研究：黑色背景上一条金色粒子带形成山脊波形，镜头缓慢推近。

## 运行

```sh
npm install
npm run build     # 渲染 out/golden-wave.mp4
npm run start     # Remotion Studio 预览
```

需要 Node 18+ 与本机 Chrome。

## 技术说明

- 26,000 个粒子的确定性粒子系统：每个粒子的位置、亮度、闪烁相位都由 (seed, frame) 纯函数决定，重复渲染结果一致（mulberry32 PRNG + 值噪声）。
- 山脊轮廓 = 高斯峰 + tanh 斜坡 + 肩部隆起，拟合参考片的波形。
- 相机：缓慢推近 + 轻微横移/纵向呼吸。
- 双遍绘制：主体粒子 + 低频「辉光」粒子模拟胶片 bloom。
- 输出：Chrome 逐帧截图 → ffmpeg H.264 (yuv420p)。

## 来源与约束

- 复刻参考自 Motion Face 社区片段「金粒波浪 · 复刻 01」（作者 jessica7168295-ux），仅作复刻研究；本仓库不收录原视频与输出视频。
- 本工程为独立复刻研究，非官方源码。

## 说明

按社区约定，本公开仓库仅含**源码、配置与说明**（不含原视频、输出视频、任何凭证）。
