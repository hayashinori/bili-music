from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import json

root = Path(__file__).resolve().parents[1]
version = json.loads((root / 'package.json').read_text(encoding='utf-8'))['version']
release = root / ('release-' + version) / 'BanCi-win32-x64'
instructions = '''伴词桌面 0.7.3

请先关闭旧版本，再双击此文件夹里的 BanCi.exe。
登录与字幕数据保存在原位置，发布包不会覆盖用户数据。

新增功能：
- 左上仅保留 Bili音乐文字；减少暂停轮询、重复布局消息和隐藏页面绘制。
  歌曲列表按需渲染，最小化暂停唱片动画，桌面歌词与播放继续运行。
- 歌词偏移、字幕源与版本选择移至左栏，扩大右栏歌词区；去掉唱片中央圆点。
- 顶栏月亮图标切换全局暗色，设置支持跟随系统。
- 侧栏新增“歌曲列表”，可从当前视频、最近播放、收藏夹或粘贴视频链接添加。
  长按歌曲/拖动柄上下排序；底部支持上一首、下一首、顺序/列表/单曲循环。
  列表、顺序、循环和明暗偏好在本机保存，沿用原账号数据。
- 沉浸模式唱针随播放落下、随暂停归位，歌词字号和翻译间距优化。
- 搜索框“×”一键清空文字；正在听右上角可进入“沉浸模式”。
  沉浸模式支持深色唱片/双语歌词布局，按 Esc 或左上按钮退出，播放不中断。
- 解锁桌面歌词后，拖左右边缘拉宽、右下角调宽高，松开应用并保存。
  也可在“歌词与设置”中输入宽度/高度；长句按框宽适应，避免错位换行。
- 歌词版本上方直接切换网易云、QQ、酷狗、LRCLIB 或自动合并。
- “刷新源”清除所选来源搜索/歌词缓存再获取，自动合并模式刷新全部来源。
  失败时保留当前字幕；收藏歌词不会被清除，翻译以来源实际提供为准。
- 左侧栏采用紧凑分组布局和整行主题色选中效果。
- 在“歌词与设置 → 全局主题色”中选择预设色或自定义颜色，自动保存。
  桌面歌词的独立颜色不受影响，可使用“恢复默认”重置应用主题。
0. 精简界面，圆形播放封面；隐藏视频时移除唱片占位，信息上移。
   歌词标题与候选版本旁可点星标，保存此视频的歌词、双语和偏移，下次直接调用。
   星标仅保存在本机；再次点击可取消，清空最近播放不会删除收藏歌词。
1. 桌面高亮平滑移动；歌词与设置中可分别调整翻译行字号。
2. 最近播放可切换卡片/列表、删除、清空、撤销。
3. 登录后显示头像和昵称；“我的收藏”可选择收藏夹并直接播放。
4. “仅听音频”隐藏画面保留声音；“关闭视频”停止并释放视频网页。
5. 音质栏根据B站播放器实际可用的音轨显示，会员音轨依赖视频与账号权限。
6. 默认省资源模式，播放时钟分离，减少重复歌词传输和界面布局。

桌面歌词默认显示深色兼容背景。
找不到歌词窗口时，点击主界面右上方“找回歌词”，或按 Ctrl + Alt + L。
该操作会重建歌词窗口、归位到屏幕内并解除锁定。
“歌词与设置”中可以关闭兼容背景，使用透明模式。
字号仍可调整；手动拉伸在松开后应用，避免透明窗口连续缩放导致显示空白。

Ctrl + Alt + D：显示/隐藏桌面歌词
Ctrl + Alt + L：找回歌词并打开主窗口

请保留整个文件夹的其他文件。无需安装插件、Python或Node.js。
'''
(release / '使用说明.txt').write_text(instructions, encoding='utf-8-sig')
(release / '验证记录.md').write_text((root / 'docs' / 'VALIDATION.md').read_text(encoding='utf-8'), encoding='utf-8')
output = root.parent / ('伴词桌面-' + version + '-Windows-x64.zip')
with ZipFile(output, 'w', ZIP_DEFLATED, compresslevel=5) as archive:
    for file in release.rglob('*'):
        if file.is_file():
            archive.write(file, Path('伴词桌面') / file.relative_to(release))
with ZipFile(output) as archive:
    assert '伴词桌面/BanCi.exe' in archive.namelist()
    assert not any('/test-profile/' in name or '/tests/' in name or name.endswith('/Cookies') for name in archive.namelist())
print('Packaged', version, round(output.stat().st_size / 1024 / 1024, 1), 'MB')
