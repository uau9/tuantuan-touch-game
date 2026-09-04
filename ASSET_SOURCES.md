# 媒体来源

当前动画版本只加载本地逐帧 PNG 与下列犬吠 MP3，不依赖联网播放，也不播放矩形背景视频。

## 小狗逐帧动画

- `assets/dog-sprites/poodle-3d-walk-v2.png`、`poodle-3d-run-v2.png`、`poodle-3d-jump-v2.png`：为本项目生成的 3D 玩具贵宾犬动作素材，每张 4 列 × 3 行、12 帧，合计 36 帧。
- `apricot`、`cream`、`brown` 文件为同一套灰色 3D 动作帧的毛发区域派生色；只重映射低饱和度毛发，保留五官、舌头与蓝黄项圈原色。
- 原始图像生成结果经过本地背景提取，输出为真实 Alpha 透明 PNG；游戏只加载当前选中的一组 3 张动作图。
- `assets/dog-sprites/gray-poodle-v1.png` 是上一版 12 帧素材，保留作历史归档，当前游戏不再加载。
- 游戏在 Canvas 中逐格裁切播放，并按运动方向水平翻转；深蓝背景、黄蓝项圈和轮廓用于增强对比度。

## 视频

以下 Coverr 视频是上一版留下的本地归档，当前游戏不再加载。它们的页面均标注 `Free Commercial Rights`。

- `assets/videos/dog-border-collie-run.mp4`：Dog running towards the camera  
  https://coverr.co/videos/dog-running-towards-the-camera-uwvrnys2ch
- `assets/videos/dog-australian-shepherd-jump.mp4`：A dog catching a ball in the park  
  https://coverr.co/videos/a-dog-catching-a-ball-in-the-park-zchkzicwwo
- `assets/videos/dog-labrador-close.mp4`：Labrador laying on the grass  
  https://coverr.co/videos/labrador-recostado-sobre-la-hierba-mhdevo1jbi

Coverr 许可说明：https://coverr.co/license

## 犬吠录音

- `assets/audio/bark-small-real.mp3`：`Ladrido perro.ogg`，作者 Edo.pt2，CC0 1.0；已转 MP3 并标准化响度。  
  https://commons.wikimedia.org/wiki/File:Ladrido_perro.ogg
- `assets/audio/bark-labrador-real.mp3`：`George vuf 1996.ogg`，作者 Broadbeer，Public Domain；已转 MP3、补短尾并标准化响度。  
  https://commons.wikimedia.org/wiki/File:George_vuf_1996.ogg
- `assets/audio/bark-dog-real.mp3`：`Barking of a dog.ogg`，作者 Amada44，CC BY-SA 3.0；本项目中的 MP3 改编文件同样按 CC BY-SA 3.0 提供，已转码并标准化响度。  
  https://commons.wikimedia.org/wiki/File:Barking_of_a_dog.ogg  
  https://creativecommons.org/licenses/by-sa/3.0/
