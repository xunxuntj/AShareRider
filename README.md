# 🏍️ A股骑士：炒股不如骑摩托 (A-Share StonkRider)

[![Cloudflare Pages](https://img.shields.io/badge/Deployed%20to-Cloudflare%20Pages-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)](https://pages.cloudflare.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![Language: HTML5/JS](https://img.shields.io/badge/Made%20with-HTML5%20%2F%20JS-EFD81D?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)

一个基于中国 A 股真实行情数据的 2D 物理摩托车越野网页小游戏，灵感来源于经典游戏 *StonkRider*。在这里，你可以选择任意一只 A 股股票，将其历史 K 线行情化为赛道，在波翻浪涌的股价曲线上飞驰、做空翻特技、收集代表盈利的收益金币！

---

## 🌟 核心特色与视觉设计

### 1. 🌌 赛博朋克证券交易风 (Slate-Cyberpunk Aesthetics)
* **红涨绿跌的发光赛道**：遵循中国 A 股配色习俗，股票上涨部分的赛道会发出红色的霓虹强光，下跌部分则会亮起绿色的霓虹灯。
* **高科技感 UI 交互**：采用毛玻璃质感、暗黑金融终端背景以及平滑的微动画，为您提供 premium 级别的证券交易视觉效果。
* **时空深度背景**：利用视差滚动效果在远景渲染淡发光的 MACD/KDJ 趋势指标曲线，拉满炒股沉浸感。

### 2. 🛞 Verlet 积分车辆悬挂系统 (Verlet Physics Engine)
* 采用完全手写的 2D Verlet 积分悬挂物理引擎。将摩托车抽象为 3 个质点（车身重心、前轮、后轮）和 3 根约束弹簧，在轻量化运行的同时，提供极为弹性的物理避震手感。
* **全地形贴线避震**：运用点到线段的几何投影算法进行轮子与折线赛道的碰撞，彻底避免在针状行情和陡峭折角处卡壳或卡入地下。
* **空中姿态微调**：内置空中平衡扭矩，让你可以随时调整倾角对齐下落的坡度。

### 3. 🔊 纯合成 Web Audio 发动机引擎 (Real-time Audio Synthesizer)
* **零外部音频资源加载**：游戏没有任何 `.mp3` 或 `.wav` 音频文件，全部声音均由 Web Audio API 现场合成生成！
* **动态引擎轰鸣**：通过双锯齿波振荡器与带通滤波器相结合，发动机的音量与音调（Pitch）会随着油门状态、车速进行动态平滑的插值微调，模拟大排量发动机的咆哮。
* **特技与音效**：实时合成了清脆的收集金币双音、跌落爆炸的白噪音低频降调等音效。

### 4. 🎚️ 行情波动平滑 (Moving Average Track Smoothing)
* 如果你选择的股票属于地狱级波动的题材股（如东方财富、宁德时代），你可以调整“行情平滑”滑块。
* 游戏后台将实时运用**滑动平均算法（Moving Average）**，降低股价的历史波动振幅，从而物理拉平赛道的陡坡，降低游戏通关难度。

### 5. 🏆 云端/单机双模排行榜 (Cloudflare KV & LocalStorage)
* **单机离线运行**：如果直接本地打开 HTML 文件，游戏会自动将您的最佳成绩和耗时记录保存在浏览器的 `localStorage` 中。
* **部署上线**：一旦将项目发布到 Cloudflare Pages 并配置好 Cloudflare KV 绑定，前端会自动转换为全球联机模式，向 Serverless 接口提交并获取该赛道全球排名前十的成绩！

---

## 📂 项目结构描述

```
├── .git
├── functions/               # Cloudflare Pages Functions (Serverless API 后端)
│   └── api/
│       ├── stock.js         # 代理新浪财经搜索及东方财富 K 线数据接口 (解决跨域，修复 GBK 乱码)
│       └── leaderboard.js   # 基于 Cloudflare KV 实现的全球排行榜提交/读取接口
├── js/                      # 游戏核心逻辑 (前端)
│   ├── api.js               # 数据交互模块，包含 EMA 平滑逻辑及本地 Presets 匹配
│   ├── config.js            # 物理常量、预设热门股票和本地离线 K 线模拟生成器
│   ├── game.js              # 游戏 Canvas 渲染主循环，音频合成器逻辑
│   ├── main.js              # 主干交互控制器，进行 DOM 事件绑定与排行榜对接
│   └── physics.js           # 2D Verlet 积分物理动力学引擎
├── index.html               # 游戏主页面入口
├── style.css                # 赛博朋克主题的全局样式表
├── test.html                # 自动化物理模拟仿真测试看板 (Headless 物理仿真验证)
└── README.md                # 项目自述文档
```

---

## 🎮 玩家与操作指南

### 电脑端 (Desktop)
* **W** 或 **上方向键 (↑)**：加速 (Gas / Accelerate)
* **S** 或 **下方向键 (↓)**：刹车 / 减速 (Brake / Reverse)
* **A** 或 **左方向键 (←)**：空中逆时针旋转 / 抬头 (Tilt Back / Lift Front Wheel)
* **D** 或 **右方向键 (→)**：空中顺时针旋转 / 压头 (Tilt Forward)
* **Space (空格键)**：跳跃 (Jump - 仅在接地时生效)
* **R**：从上一个存档点复活 (Respawn)
* **Esc / P**：暂停游戏 (Pause)

### 移动端 (Mobile)
* 游戏完全适配触屏。进入骑行界面后会亮起精美的虚拟手柄：左侧是“抬起/压下”姿态舵，右侧是“加速”与“刹车”踏板。

---

## 🛠️ 本地运行与开发调试

### 1. 直接双击运行 (完全离线)
您可以直接双击 `index.html` 在任何浏览器中游玩。由于缺少后端 Serverless 环境，此时游戏将：
* 自动使用本地预设股票列表（包含**平安银行**、**上证指数**、**贵州茅台**等）。
* 自动通过本地生成的随机 K 线进行游玩。
* 排行榜功能降级为本地 `localStorage`。

### 2. 本地静态服务运行
在项目根目录运行命令开启本地服务器：
```bash
# Python 3
python -m http.server 8000
```
在浏览器中访问 `http://localhost:8000` 即可开始游玩。

### 3. 运行物理稳定性自动化测试
为了保证在更新物理参数后，摩托车仍能顺畅游玩（不发生起步翻车或卡点），可以打开测试看板进行快速物理仿真测试：
* 访问 `http://localhost:8000/test.html`，点击 **“开始运行物理测试”**。
* 系统将在内存中运行 4 个高强度的自动化测试用例，并输出 frame-by-frame 物理运行状态。全部显示绿色 `PASSED` 即代表物理系统稳定无虞。

---

## 🌐 免费部署至 Cloudflare Pages

Cloudflare Pages 是托管本项目的最完美选择（完全免费，支持 Serverless Functions，且国内直连速度快）。

### 第一步：将代码推送至您的 GitHub
新建一个仓库，将代码推送到您的 GitHub 个人账号下。

### 第二步：在 Cloudflare Dashboard 导入项目
1. 登录 [Cloudflare 控制台](https://dash.cloudflare.com/)，在左侧栏选择 **Workers & Pages** -> 点击 **Create**。
2. 切换至 **Pages** 选项卡 -> 点击 **Connect to Git** 关联 GitHub 账号，并选择此项目仓库。
3. **Build settings (构建设置)** 配置如下：
   - **Framework preset**：选择 **`None`** (或者 `Static HTML`)。
   - **Build command**：**保持为空**。
   - **Build output directory**：填写 **`/`**（即仓库根目录）。
4. 点击 **Save and Deploy** 按钮。系统将在一分钟内分配免费域名并完成上线。

### 第三步：绑定 KV 数据库（启用全球排行榜）
1. 在 Cloudflare 控制台导航至左侧侧边栏的 **Workers & Pages** -> **KV** -> 点击右上角 **Create a namespace**。
2. 命名空间名字填写：**`STONK_LEADERBOARD`**。
3. 返回您的 **Pages 管理页面** -> 点击 **Settings (设置)** -> 选择左侧的 **Functions (函数)**。
4. 找到 **KV namespace bindings** 栏目 -> 点击 **Add binding**：
   - **Variable name (变量名)**：填写 **`STONK_LEADERBOARD`**。
   - **KV namespace (空间)**：选择刚才创建的 `STONK_LEADERBOARD` 空间。
5. 点击 **Save** 保存。
6. **重要**：保存后，切换到 **Deployments (部署)** 选项卡 -> 选择最新的一次部署 -> 点击 **Redeploy (重新部署)** 重新生成站点，绑定即可正式生效。

---

## 📄 开源许可证

本项目基于 [MIT License](LICENSE) 开源。
欢迎任何形式的 Pull Request、Issue 提交和特技摩托改装玩法反馈！
