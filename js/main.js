import { TRENDING_TRACKS, generateOfflineKlines } from './config.js';
import { fetchStockData, searchStocks, smoothPrices } from './api.js';
import { GameController } from './game.js';

// 全局状态变量
let gameController = null;
let currentStockCode = "";
let currentStockName = "";
let currentStockSecid = "";
let activeStockData = null; // 当前载入的K线原始数据
let currentPeriod = "1Y";   // 默认周期
let smoothWindowVal = 1;    // 1 表示不平滑 (OFF)

// 初始化生命周期数据 (从 localStorage)
let userStats = {
    rides: 0,
    crashes: 0,
    highScore: 0
};

// 页面加载入口
window.addEventListener('DOMContentLoaded', () => {
    initApp();
});

/**
 * 初始化应用程序
 */
function initApp() {
    // 1. 检查触屏支持以显示触控手柄
    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (isTouch) {
        document.body.classList.add('is-touch');
    }

    // 2. 载入玩家本地记录
    loadUserStats();

    // 3. 渲染主页的热门推荐卡片
    renderTrendingTracks();

    // 4. 初始化游戏渲染引擎
    const canvas = document.getElementById('game-canvas');
    resizeCanvas(canvas);
    window.addEventListener('resize', () => {
        if (canvas) resizeCanvas(canvas);
    });

    gameController = new GameController(canvas, {
        onScoreChange: (score) => {
            updateHUDScore(score);
        },
        onCrash: (reason) => {
            showCrashOverlay(reason);
        },
        onVictory: (score, time) => {
            showVictoryOverlay(score, time);
        },
        onCheckpoint: (cp) => {
            showCheckpointNotification(cp);
        }
    });

    // 5. 绑定各个页面的 UI 交互事件
    setupUIListeners();
}

/**
 * 自适应 Canvas 大小
 */
function resizeCanvas(canvas) {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

/**
 * 从 localStorage 读取玩家数据
 */
function loadUserStats() {
    const saved = localStorage.getItem('stonkrider_user_stats');
    if (saved) {
        try {
            userStats = JSON.parse(saved);
        } catch (e) {
            console.error("解析玩家数据失败", e);
        }
    }
    updateHomeStatsUI();
}

/**
 * 保存玩家数据
 */
function saveUserStats() {
    localStorage.setItem('stonkrider_user_stats', JSON.stringify(userStats));
    updateHomeStatsUI();
}

function updateHomeStatsUI() {
    document.getElementById('stat-rides').textContent = userStats.rides;
    document.getElementById('stat-crashes').textContent = userStats.crashes;
    document.getElementById('stat-profit').textContent = `${userStats.highScore} pts`;
}

/**
 * 渲染主页推荐赛道卡片并绘制微型折线图 (Sparklines)
 */
function renderTrendingTracks() {
    const grid = document.getElementById('trending-tracks-grid');
    grid.innerHTML = "";

    TRENDING_TRACKS.forEach(track => {
        const card = document.createElement('div');
        card.className = 'track-card';
        
        // 解析难度
        const diffClass = track.difficulty.toLowerCase();
        
        card.innerHTML = `
            <div class="track-card-header">
                <div class="track-name-wrapper">
                    <span class="track-name">${track.name}</span>
                    <span class="track-code">${track.code}.${track.market === 1 ? 'SH' : 'SZ'}</span>
                </div>
                <span class="difficulty-badge ${diffClass}">${track.difficultyText}</span>
            </div>
            <div class="track-sparkline-wrapper">
                <canvas id="sparkline-${track.code}" class="track-sparkline"></canvas>
            </div>
            <div class="track-desc">${track.desc}</div>
        `;

        // 点击卡片进入预览选关
        card.addEventListener('click', () => {
            selectStock(track.code, track.name, track.secid_full || track.secid);
        });

        grid.appendChild(card);

        // 异步在卡片的 Canvas 上绘制微缩 K 线图 (红绿发光)
        setTimeout(() => {
            drawSparkline(track.code);
        }, 100);
    });
}

/**
 * 绘制微型 K 线发光线
 */
function drawSparkline(code) {
    const canvas = document.getElementById(`sparkline-${code}`);
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.offsetWidth;
    const h = canvas.height = canvas.offsetHeight;

    // 虚拟生成一段 40 天的数据用于绘制
    const mockKlines = generateOfflineKlines(code, 40).map(line => {
        const parts = line.split(',');
        return {
            close: parseFloat(parts[2])
        };
    });

    const prices = mockKlines.map(k => k.close);
    const maxP = Math.max(...prices);
    const minP = Math.min(...prices);
    const range = maxP - minP || 1;

    ctx.fillStyle = '#0c0d12';
    ctx.fillRect(0, 0, w, h);

    // 绘制发光线
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (let i = 0; i < mockKlines.length - 1; i++) {
        const p1 = mockKlines[i];
        const p2 = mockKlines[i+1];
        
        const x1 = (i / (mockKlines.length - 1)) * (w - 10) + 5;
        const y1 = h - 5 - ((p1.close - minP) / range) * (h - 10);
        const x2 = ((i + 1) / (mockKlines.length - 1)) * (w - 10) + 5;
        const y2 = h - 5 - ((p2.close - minP) / range) * (h - 10);

        const isUp = p2.close >= p1.close;
        const color = isUp ? "#ff4d4f" : "#52c41a";

        ctx.strokeStyle = color;
        ctx.shadowBlur = 6;
        ctx.shadowColor = color;
        
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    }
}

/**
 * 绑定所有 UI 交互按键
 */
function setupUIListeners() {
    // A. 搜索建议联想逻辑
    const searchInput = document.getElementById('stock-search-input');
    const dropdown = document.getElementById('search-dropdown-menu');
    const clearBtn = document.getElementById('search-clear-btn');
    
    let debounceTimer = null;
    searchInput.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        clearTimeout(debounceTimer);
        
        if (!val) {
            dropdown.classList.remove('active');
            return;
        }

        debounceTimer = setTimeout(async () => {
            const results = await searchStocks(val);
            if (results && results.length > 0) {
                dropdown.innerHTML = "";
                results.slice(0, 8).forEach(item => {
                    const row = document.createElement('div');
                    row.className = 'search-item';
                    row.innerHTML = `
                        <div class="search-item-info">
                            <span class="search-item-code">${item.code}</span>
                            <span style="font-weight: 600;">${item.name}</span>
                        </div>
                        <span class="search-item-market">${item.market === 1 ? '沪市 SH' : '深市 SZ'}</span>
                    `;
                    row.addEventListener('click', () => {
                        dropdown.classList.remove('active');
                        searchInput.value = "";
                        selectStock(item.code, item.name, item.secid);
                    });
                    dropdown.appendChild(row);
                });
                dropdown.classList.add('active');
            } else {
                dropdown.innerHTML = `<div style="padding: 12px; color: var(--text-muted); text-align: center;">未找到匹配股票</div>`;
                dropdown.classList.add('active');
            }
        }, 300); // 300ms 防抖
    });

    // 清除搜索
    clearBtn.addEventListener('click', () => {
        searchInput.value = "";
        dropdown.classList.remove('active');
    });

    // 点击外部关闭搜索下拉框
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.remove('active');
        }
    });

    // B. 预览界面返回主页
    document.getElementById('preview-back-btn').addEventListener('click', () => {
        switchScreen('home-screen');
    });

    // C. 预览周期切换
    const periodButtons = document.querySelectorAll('#period-btn-group .btn-toggle');
    periodButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            periodButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentPeriod = btn.dataset.period;
            reloadPreviewData(); // 重新加载该周期的股价数据
        });
    });

    // D. 平滑度滑动条切换
    const smoothSlider = document.getElementById('smooth-range-slider');
    const smoothValText = document.getElementById('smooth-slider-value');
    smoothSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        smoothWindowVal = val;
        
        if (val === 1) {
            smoothValText.textContent = "OFF";
        } else {
            smoothValText.textContent = `${val} 日线`;
        }

        // 重新渲染预览图 (无需重新发网络请求，直接平滑)
        if (activeStockData) {
            renderPreviewChart();
            updatePreviewMetrics();
        }
    });

    // E. 启动骑行挑战按钮
    document.getElementById('start-ride-btn').addEventListener('click', () => {
        if (!activeStockData) return;
        startLevelPlay();
    });

    // F. 游戏画面按钮
    document.getElementById('game-pause-btn').addEventListener('click', () => {
        exitToMainMenu();
    });

    document.getElementById('game-reset-btn').addEventListener('click', () => {
        gameController.handleReset();
    });

    // 静音/开启音效
    const muteBtn = document.getElementById('game-mute-btn');
    muteBtn.addEventListener('click', () => {
        if (gameController) {
            gameController.audio.muted = !gameController.audio.muted;
            muteBtn.textContent = gameController.audio.muted ? "🔇 静音" : "🔊 声音";
            // 如果静音，停止当前的发动机轰鸣
            if (gameController.audio.muted) {
                gameController.audio.stopEngine();
            }
        }
    });

    // G. 坠毁弹窗按钮
    document.getElementById('crash-respawn-btn').addEventListener('click', () => {
        document.getElementById('crash-overlay').classList.remove('active');
        gameController.handleReset();
    });
    document.getElementById('crash-exit-btn').addEventListener('click', () => {
        document.getElementById('crash-overlay').classList.remove('active');
        exitToMainMenu();
    });

    // H. 胜利弹窗按钮
    document.getElementById('vic-replay-btn').addEventListener('click', () => {
        document.getElementById('victory-overlay').classList.remove('active');
        startLevelPlay();
    });
    document.getElementById('vic-exit-btn').addEventListener('click', () => {
        document.getElementById('victory-overlay').classList.remove('active');
        exitToMainMenu();
    });

    // 提交排行榜成绩
    document.getElementById('leaderboard-submit-btn').addEventListener('click', () => {
        submitScoreToLeaderboard();
    });

    // I. 手机端虚拟摇杆操控映射 (Touch / Mouse)
    const mapTouch = (id, keyName) => {
        const btn = document.getElementById(id);
        const setKey = (isDown) => {
            if (gameController) {
                gameController.input[keyName] = isDown;
            }
        };

        btn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            setKey(true);
        });
        btn.addEventListener('touchend', (e) => {
            e.preventDefault();
            setKey(false);
        });

        // 兼容鼠标点击 (用于非触屏设备的调试)
        btn.addEventListener('mousedown', () => setKey(true));
        btn.addEventListener('mouseup', () => setKey(false));
        btn.addEventListener('mouseleave', () => setKey(false));
    };

    mapTouch('touch-gas', 'gas');
    mapTouch('touch-brake', 'brake');
    mapTouch('touch-tilt-left', 'tiltLeft');
    mapTouch('touch-tilt-right', 'tiltRight');

    // 特殊单次动作
    document.getElementById('touch-jump').addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (gameController) {
            gameController.input.jump = true;
            gameController.audio.playJumpSound();
            setTimeout(() => { gameController.input.jump = false; }, 80);
        }
    });
    document.getElementById('touch-jump').addEventListener('mousedown', () => {
        if (gameController) {
            gameController.input.jump = true;
            gameController.audio.playJumpSound();
            setTimeout(() => { gameController.input.jump = false; }, 80);
        }
    });

    document.getElementById('touch-reset').addEventListener('click', (e) => {
        e.preventDefault();
        if (gameController) gameController.handleReset();
    });
}

/**
 * 屏幕切页管理
 */
function switchScreen(screenId) {
    const screens = document.querySelectorAll('.screen');
    screens.forEach(s => s.classList.remove('active'));
    
    const target = document.getElementById(screenId);
    if (target) {
        target.classList.add('active');
    }
}

/**
 * 选定股票，切换至预览配置界面
 */
async function selectStock(code, name, secid) {
    currentStockCode = code;
    currentStockName = name;
    currentStockSecid = secid || "";

    // 默认恢复 1 年周期且不平滑
    currentPeriod = "1Y";
    smoothWindowVal = 1;
    document.getElementById('smooth-range-slider').value = 1;
    document.getElementById('smooth-slider-value').textContent = "OFF";

    const periodButtons = document.querySelectorAll('#period-btn-group .btn-toggle');
    periodButtons.forEach(b => {
        b.classList.remove('active');
        if (b.dataset.period === "1Y") b.classList.add('active');
    });

    switchScreen('level-preview-screen');
    await reloadPreviewData();
}

/**
 * 重新加载并更新预览界面的数据
 */
async function reloadPreviewData() {
    // Renders loading indicators
    document.getElementById('preview-stock-name').textContent = currentStockName;
    document.getElementById('preview-stock-code').textContent = `${currentStockCode}.${currentStockSecid.startsWith("1") ? "SH" : "SZ"}`;
    
    // 设置难度徽章
    const diffBadge = document.getElementById('preview-difficulty');
    diffBadge.className = 'difficulty-badge';
    
    // 匹配预设的难度
    const preset = TRENDING_TRACKS.find(t => t.code === currentStockCode);
    const diffText = preset ? preset.difficultyText : "普通";
    const diffVal = preset ? preset.difficulty.toLowerCase() : "medium";
    
    diffBadge.textContent = diffText;
    diffBadge.classList.add(diffVal);

    // 加载动画
    document.getElementById('leaderboard-loading').style.display = "block";
    document.getElementById('leaderboard-list-container').style.display = "none";

    try {
        activeStockData = await fetchStockData(currentStockCode, currentPeriod, currentStockSecid);
        
        renderPreviewChart();
        updatePreviewMetrics();
        loadLeaderboard(); // 异步载入该赛道排行榜
    } catch (e) {
        console.error("加载赛道数据失败", e);
    }
}

/**
 * 渲染预览页的小 K 线预览 (双击 HTML 无 proxy 下也会美观展示)
 */
function renderPreviewChart() {
    const canvas = document.getElementById('preview-sparkline-canvas');
    if (!canvas || !activeStockData) return;

    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.offsetWidth;
    const h = canvas.height = canvas.offsetHeight;

    // 获取有可能已经被平滑的数据
    const smoothedKlines = smoothPrices(activeStockData.klines, smoothWindowVal);
    const prices = smoothedKlines.map(k => k.smoothedClose);
    const maxP = Math.max(...prices);
    const minP = Math.min(...prices);
    const range = maxP - minP || 1;

    ctx.fillStyle = '#0a0c10';
    ctx.fillRect(0, 0, w, h);

    // 绘制灰色背景辅助横线 (类似证券网格)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i <= 3; i++) {
        const y = (i / 4) * h;
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
    }
    ctx.stroke();

    // 绘制霓虹行情线
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (let i = 0; i < smoothedKlines.length - 1; i++) {
        const p1 = smoothedKlines[i];
        const p2 = smoothedKlines[i+1];
        
        const x1 = (i / (smoothedKlines.length - 1)) * (w - 20) + 10;
        const y1 = h - 15 - ((p1.smoothedClose - minP) / range) * (h - 30);
        const x2 = ((i + 1) / (smoothedKlines.length - 1)) * (w - 20) + 10;
        const y2 = h - 15 - ((p2.smoothedClose - minP) / range) * (h - 30);

        const isUp = p2.price >= p1.price; // 按当天实际涨跌配色
        const color = isUp ? "#ff4d4f" : "#52c41a";

        ctx.strokeStyle = color;
        ctx.shadowBlur = 8;
        ctx.shadowColor = color;
        
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    }
}

/**
 * 刷新关卡的物理指标属性
 */
function updatePreviewMetrics() {
    if (!activeStockData) return;

    const smoothedKlines = smoothPrices(activeStockData.klines, smoothWindowVal);
    const prices = smoothedKlines.map(k => k.smoothedClose);
    const maxP = Math.max(...prices);
    const minP = Math.min(...prices);
    
    // 区间波动率
    const volatilityPct = ((maxP - minP) / minP) * 100;
    
    // 历史涨跌幅 (区间终点价 vs 起点价)
    const firstPrice = activeStockData.klines[0].close;
    const lastPrice = activeStockData.klines[activeStockData.klines.length - 1].close;
    const changePct = ((lastPrice - firstPrice) / firstPrice) * 100;

    // 最大爬坡坡度 (估算)
    let maxSlopeDeg = 0;
    for (let i = 0; i < smoothedKlines.length - 1; i++) {
        const dy = Math.abs(smoothedKlines[i+1].smoothedClose - smoothedKlines[i].smoothedClose);
        // 使用一个基准尺度折算
        const dx = (maxP - minP) / (smoothedKlines.length * 0.1); 
        const slope = Math.atan2(dy, dx) * 180 / Math.PI;
        if (slope > maxSlopeDeg) maxSlopeDeg = slope;
    }

    document.getElementById('metric-points').textContent = activeStockData.klines.length;
    document.getElementById('metric-volatility').textContent = `${volatilityPct.toFixed(1)}%`;
    document.getElementById('metric-slope').textContent = `${Math.round(maxSlopeDeg)}°`;
    
    const changeEl = document.getElementById('metric-change');
    changeEl.textContent = `${changePct >= 0 ? '+' : ''}${changePct.toFixed(1)}%`;
    changeEl.style.color = changePct >= 0 ? 'var(--neon-red)' : 'var(--neon-green)';
}

/**
 * 加载当前赛道的排行榜 (全球)
 */
async function loadLeaderboard() {
    const isLocal = window.location.protocol === 'file:';

    const smoothed = smoothWindowVal > 1;
    const listContainer = document.getElementById('leaderboard-list-container');
    const loadingText = document.getElementById('leaderboard-loading');

    let scores = [];

    if (isLocal && !window.forceCloudflareAPI) {
        // 本地环境加载 localStorage 排行榜
        const localKey = `leaderboard:${currentStockCode}:${currentPeriod}:${smoothed}`;
        const saved = localStorage.getItem(localKey);
        scores = saved ? JSON.parse(saved) : [];
    } else {
        try {
            const response = await fetch(`/api/leaderboard?code=${currentStockCode}&period=${currentPeriod}&smoothed=${smoothed}`);
            if (response.ok) {
                const json = await response.json();
                if (json && json.status === "local_mode") {
                    // KV 未绑定，降级本地存储
                    const localKey = `leaderboard:${currentStockCode}:${currentPeriod}:${smoothed}`;
                    const saved = localStorage.getItem(localKey);
                    scores = saved ? JSON.parse(saved) : [];
                } else {
                    scores = json;
                }
            }
        } catch (e) {
            console.warn("请求全球排行榜失败，降级本地成绩:", e);
            const localKey = `leaderboard:${currentStockCode}:${currentPeriod}:${smoothed}`;
            const saved = localStorage.getItem(localKey);
            scores = saved ? JSON.parse(saved) : [];
        }
    }

    loadingText.style.display = "none";
    listContainer.innerHTML = "";

    if (scores.length === 0) {
        listContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 10px;">暂无挑战纪录，来抢沙发吧！</div>`;
    } else {
        scores.forEach((record, index) => {
            const row = document.createElement('div');
            row.className = 'leaderboard-row';
            row.innerHTML = `
                <span class="rank-badge rank-${index + 1}">${index + 1}</span>
                <span class="leaderboard-name">${record.name}</span>
                <span class="leaderboard-score">${record.score} pts</span>
                <span class="leaderboard-time">${record.time}s</span>
            `;
            listContainer.appendChild(row);
        });
    }

    listContainer.style.display = "flex";
}

/**
 * 启动进入游戏骑行画面
 */
function startLevelPlay() {
    switchScreen('game-screen');
    
    // 隐藏可能处于活动状态的所有覆盖弹窗
    document.getElementById('crash-overlay').classList.remove('active');
    document.getElementById('victory-overlay').classList.remove('active');

    // 更新 HUD 顶部展示的股票名称与代码
    document.getElementById('hud-stock-name').textContent = activeStockData.name;
    const isSH = activeStockData.code.startsWith("6") || activeStockData.code.startsWith("9") || activeStockData.code.startsWith("5") || activeStockData.code === "000001" || activeStockData.code === "000300";
    document.getElementById('hud-stock-code').textContent = `${activeStockData.code}.${isSH ? 'SH' : 'SZ'}`;

    // 载入关卡
    gameController.loadLevel(activeStockData, smoothWindowVal);
    gameController.start();

    // 更新生涯骑行统计次数
    userStats.rides++;
    saveUserStats();
}

/**
 * 退出游戏返回选关主菜单
 */
function exitToMainMenu() {
    if (gameController) {
        gameController.stop();
    }
    switchScreen('home-screen');
    loadUserStats(); // 重新加载成就
}

/**
 * 更新 HUD 分数面板
 */
function updateHUDScore(score) {
    const s = String(score).padStart(6, '0');
    document.getElementById('hud-score').textContent = s;
}

/**
 * 每秒定时更新 HUD 时钟与当前股价点
 */
let hudTimerInterval = null;
if (hudTimerInterval) clearInterval(hudTimerInterval);

setInterval(() => {
    const screen = document.getElementById('game-screen');
    if (screen && screen.classList.contains('active') && gameController && gameController.bike) {
        // 1. 更新计时器
        const time = gameController.timeElapsed;
        const min = Math.floor(time / 60);
        const sec = Math.floor(time % 60);
        const ms = Math.floor((time % 1) * 10);
        document.getElementById('hud-timer').textContent = `${min}:${String(sec).padStart(2, '0')}.${ms}`;

        // 2. 更新对应股价
        const bikeX = gameController.bike.getX();
        const pts = gameController.trackPoints;
        const totalX = pts[pts.length - 1].x;
        const ratioX = Math.max(0, Math.min(1.0, bikeX / totalX));
        const idx = Math.min(pts.length - 1, Math.floor(ratioX * (pts.length - 1)));
        
        const currPoint = pts[idx];
        const nextPoint = pts[idx + 1] || currPoint;

        const isUp = nextPoint.price >= currPoint.price;
        const priceEl = document.getElementById('hud-price');
        priceEl.textContent = `¥${currPoint.price.toFixed(2)}`;
        priceEl.style.color = isUp ? 'var(--neon-red)' : 'var(--neon-green)';
        priceEl.style.textShadow = isUp ? '0 0 8px var(--neon-red-glow)' : '0 0 8px var(--neon-green-glow)';
    }
}, 100);

/**
 * 显示存档激活短暂提示
 */
function showCheckpointNotification(cp) {
    // 可以在顶端以粒子闪烁，或者更新股价
    console.log(`[Checkpoint] Passed at price: ¥${cp.price.toFixed(2)}`);
}

/**
 * 显示坠毁界面
 */
function showCrashOverlay(reason) {
    // 累加生涯摔车数
    userStats.crashes++;
    saveUserStats();

    document.getElementById('crash-count-val').textContent = gameController.crashesCount;
    document.getElementById('crash-overlay').classList.add('active');
}

/**
 * 显示胜利界面
 */
function showVictoryOverlay(score, time) {
    // 刷新生涯高分纪录
    if (score > userStats.highScore) {
        userStats.highScore = score;
    }
    saveUserStats();

    // 格式化时长
    const min = Math.floor(time / 60);
    const sec = Math.floor(time % 60);
    const ms = Math.floor((time % 1) * 10);
    const timeStr = `${min}:${String(sec).padStart(2, '0')}.${ms}`;

    document.getElementById('vic-time-val').textContent = `${timeStr} (${time.toFixed(1)} 秒)`;
    document.getElementById('vic-score-val').textContent = `${score} pts`;
    document.getElementById('vic-smoothed-val').textContent = smoothWindowVal > 1 ? `已平滑 (${smoothWindowVal}日线)` : "无平滑 (原版高难度)";

    // 恢复提交面板
    const submitBtn = document.getElementById('leaderboard-submit-btn');
    submitBtn.disabled = false;
    submitBtn.textContent = "⚡ 提交";
    document.getElementById('submit-status-msg').textContent = "";
    document.getElementById('leaderboard-nick-input').disabled = false;

    document.getElementById('victory-overlay').classList.add('active');
}

/**
 * 提交成绩到全球或本地排行榜
 */
async function submitScoreToLeaderboard() {
    const nickInput = document.getElementById('leaderboard-nick-input');
    const nickname = nickInput.value.trim();
    const statusMsg = document.getElementById('submit-status-msg');
    const submitBtn = document.getElementById('leaderboard-submit-btn');

    if (!nickname) {
        statusMsg.textContent = "❌ 请先输入你的昵称！";
        statusMsg.style.color = "var(--neon-red)";
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "提交中...";

    const score = gameController.score;
    const time = gameController.timeElapsed;
    const smoothed = smoothWindowVal > 1;

    const payload = {
        code: currentStockCode,
        period: currentPeriod,
        smoothed: smoothed,
        name: nickname,
        score: score,
        time: time
    };

    const isLocal = window.location.protocol === 'file:';

    if (isLocal && !window.forceCloudflareAPI) {
        // 本地环境直接存入 localStorage
        saveScoreLocally(payload);
        statusMsg.textContent = "✅ 本地记录提交成功！";
        statusMsg.style.color = "var(--neon-green)";
        nickInput.disabled = true;
    } else {
        try {
            const response = await fetch('/api/leaderboard', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                const result = await response.json();
                if (result.status === "local_mode") {
                    // KV 未绑定，降级本地存储
                    saveScoreLocally(payload);
                    statusMsg.textContent = "✅ (本地模式) 记录成功！";
                } else {
                    statusMsg.textContent = "✅ 全球榜单成绩提交成功！";
                }
                statusMsg.style.color = "var(--neon-green)";
                nickInput.disabled = true;
            } else {
                const errJson = await response.json();
                statusMsg.textContent = `❌ 提交失败: ${errJson.error || '服务器错误'}`;
                statusMsg.style.color = "var(--neon-red)";
                submitBtn.disabled = false;
                submitBtn.textContent = "⚡ 提交";
            }
        } catch (e) {
            console.warn("网络异常，降级提交至本地:", e);
            saveScoreLocally(payload);
            statusMsg.textContent = "⚠️ 网络不可用，成绩已记入本地！";
            statusMsg.style.color = "#faad14";
            nickInput.disabled = true;
        }
    }
}

/**
 * 辅助方法：将成绩保存至本地 LocalStorage 排行榜
 */
function saveScoreLocally(record) {
    const localKey = `leaderboard:${record.code}:${record.period}:${record.smoothed}`;
    const saved = localStorage.getItem(localKey);
    let scores = saved ? JSON.parse(saved) : [];

    scores.push({
        name: record.name,
        score: Math.round(record.score),
        time: parseFloat(record.time.toFixed(1)),
        date: new Date().toISOString().split('T')[0]
    });

    // 排序：高分优先，同分少时优先
    scores.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.time - b.time;
    });

    // 截取前 10
    scores = scores.slice(0, 10);
    localStorage.setItem(localKey, JSON.stringify(scores));
}
