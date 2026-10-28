# 开发与构建

## 环境

- Node.js 24、npm；桌面运行与原生窗口测试面向 Windows x64。
- Python 3 只用于生成发行 ZIP；普通用户运行预编译版不需要它。
- Electron 和打包器由 `npm ci` 安装，以 `package-lock.json` 为准。

```powershell
npm ci
npm start
npm test
npm run package
python scripts/package-zip.py
```

打包目录为 `release-<版本>/BanCi-win32-x64`，ZIP 位于项目上级目录。请保持 `package.json`、锁文件与打包命令中的版本一致。

## 结构

| 路径 | 用途 |
| --- | --- |
| `main.cjs` / `preload.cjs` | 原生窗口、B 站视图与受限 IPC |
| `guest-preload.cjs` | 隔离世界中的媒体时间与状态读取 |
| `model.cjs` | 歌词匹配、时间轴、偏移与本机持久化 |
| `song-queue.cjs` | 列表去重、排序和循环决策 |
| `shared/` | 歌词解析、来源适配与主题元数据 |
| `renderer/` | 主界面、沉浸模式与桌面歌词 |
| `tests/` | 单元测试和 Electron 联动测试 |

## 原生窗口测试

单元测试不访问真实账号。联动测试需要 Playwright 驱动项目自己的 Electron，不需要下载 Chromium：

```powershell
npm install --no-save --package-lock=false playwright
node tests/desktop-smoke.cjs
node tests/immersive-smoke.cjs
node tests/queue-dark-smoke.cjs
node tests/floating-size-smoke.cjs
node tests/performance-smoke.cjs
```

测试使用 `artifacts/` 内的独立配置和可控页面。设置 `BANCI_EXECUTABLE` 可直接验证打包后的 `BanCi.exe`；`PLAYWRIGHT_MODULE` 仅在 Playwright 不位于本项目依赖目录时需要。

示例截图可用 `node scripts/capture-preview.cjs` 生成。不要使用个人会话截图代替示例图。

## 兼容性约定

- 保留 `app.setName('伴词桌面')`，避免升级后改变既有用户的数据目录。
- 透明歌词窗口在松开拖拽后重建一次，不启用持续原生缩放；字号更新不能引起窗口尺寸循环变化。
- 不将视频站点 Cookie 传给歌词源。原生浮窗只接收必要的时钟与显示设置。
- 不在每次播放时钟更新时传输整份歌词、列表或历史记录。

## 自动构建

GitHub Actions 在推送和 PR 时运行单元测试。版本文件更新到主分支或手动运行 Windows 发布工作流时，会构建 ZIP 并创建对应版本的 Release；已有版本不会自动覆盖。

第三方站点接口变化可能导致真实网络失败，验证边界记录在根目录 `VALIDATION.md`。
