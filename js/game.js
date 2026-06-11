import { PHYSICS_CONFIG } from './config.js';
import { Motorcycle } from './physics.js';
import { smoothPrices } from './api.js';

// Web Audio API 合成器，用于生成免加载的音效
class AudioEngine {
    constructor() {
        this.ctx = null;
        this.engineOsc = null;
        this.engineGain = null;
        this.muted = false;
    }

    init() {
        if (this.ctx) return;
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.setupEngineSound();
        } catch (e) {
            console.warn("Web Audio API 初始化失败:", e);
        }
    }

    setupEngineSound() {
        if (!this.ctx) return;
        
        // 创建引擎声振荡器 (锯齿波模拟发动机轰鸣)
        this.engineOsc = this.ctx.createOscillator();
        this.engineOsc.type = 'sawtooth';
        this.engineOsc.frequency.setValueAtTime(45, this.ctx.currentTime);

        // 带通滤波器让发动机声音听起来低沉些
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(120, this.ctx.currentTime);
        filter.Q.setValueAtTime(1.0, this.ctx.currentTime);

        this.engineGain = this.ctx.createGain();
        this.engineGain.gain.setValueAtTime(0.0, this.ctx.currentTime); // 默认无声

        this.engineOsc.connect(filter);
        filter.connect(this.engineGain);
        this.engineGain.connect(this.ctx.destination);
        
        this.engineOsc.start(0);
    }

    setEnginePitchAndVolume(speed, isGasPressed) {
        if (!this.ctx || this.muted) return;
        
        this.init(); // 确保用户交互后激活 Context
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }

        if (!this.engineOsc || !this.engineGain) return;

        // 根据速度和是否踩油门调节发动机音调和音量
        const baseFreq = 45;
        const targetFreq = baseFreq + speed * 12 + (isGasPressed ? 40 : 0);
        this.engineOsc.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.1);

        const targetVol = isGasPressed ? 0.12 : 0.04;
        this.engineGain.gain.setTargetAtTime(targetVol, this.ctx.currentTime, 0.15);
    }

    stopEngine() {
        if (this.engineGain) {
            this.engineGain.gain.setTargetAtTime(0.0, this.ctx.currentTime, 0.1);
        }
    }

    playCoinSound() {
        if (!this.ctx || this.muted) return;
        this.init();
        
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        
        // 双音 chime: C5 -> G5
        const now = this.ctx.currentTime;
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.setValueAtTime(783.99, now + 0.08); // G5

        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.start(now);
        osc.stop(now + 0.4);
    }

    playJumpSound() {
        if (!this.ctx || this.muted) return;
        this.init();

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';

        const now = this.ctx.currentTime;
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(400, now + 0.15); // 向上掠过的声音

        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.2);
    }

    playCrashSound() {
        if (!this.ctx || this.muted) return;
        this.init();

        const now = this.ctx.currentTime;
        
        // 1. 低频爆炸震动
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.exponentialRampToValueAtTime(20, now + 0.4);

        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.5);

        // 2. 模拟白噪音爆破 (金属破碎感)
        try {
            const bufferSize = this.ctx.sampleRate * 0.4;
            const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }

            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;

            const noiseFilter = this.ctx.createBiquadFilter();
            noiseFilter.type = 'lowpass';
            noiseFilter.frequency.setValueAtTime(800, now);

            const noiseGain = this.ctx.createGain();
            noiseGain.gain.setValueAtTime(0.15, now);
            noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

            noise.connect(noiseFilter);
            noiseFilter.connect(noiseGain);
            noiseGain.connect(this.ctx.destination);

            noise.start(now);
            noise.stop(now + 0.4);
        } catch (e) {}
    }

    playCheckpointSound() {
        if (!this.ctx || this.muted) return;
        this.init();

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';

        const now = this.ctx.currentTime;
        osc.frequency.setValueAtTime(440, now); // A4
        osc.frequency.setValueAtTime(554.37, now + 0.1); // C#5
        osc.frequency.setValueAtTime(659.25, now + 0.2); // E5

        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.5);
    }

    playVictorySound() {
        if (!this.ctx || this.muted) return;
        this.init();

        const now = this.ctx.currentTime;
        const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6琶音
        notes.forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, now + i * 0.12);
            
            gain.gain.setValueAtTime(0.08, now + i * 0.12);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.4);
            
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            
            osc.start(now + i * 0.12);
            osc.stop(now + i * 0.12 + 0.4);
        });
    }
}

// 粒子系统，用于展示尾气、轮子尘土、硬着陆以及爆炸效果
class ParticleEngine {
    constructor() {
        this.particles = [];
    }

    spawn(x, y, vx, vy, color, size, life, type = "spark") {
        this.particles.push({
            x, y, vx, vy, color, size, life, maxLife: life, type
        });
    }

    update(dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= dt;
            if (p.life <= 0) {
                this.particles.splice(i, 1);
                continue;
            }

            p.x += p.vx;
            p.y += p.vy;

            // 如果是火花/碎片，受重力影响下坠
            if (p.type === "spark" || p.type === "wreck") {
                p.vy -= 0.1; 
            }
        }
    }

    draw(ctx) {
        ctx.save();
        this.particles.forEach(p => {
            const alpha = p.life / p.maxLife;
            ctx.fillStyle = p.color;
            ctx.globalAlpha = alpha;
            ctx.shadowBlur = p.type === "spark" ? 6 : 0;
            ctx.shadowColor = p.color;

            ctx.beginPath();
            if (p.type === "wreck") {
                // 绘制方块碎片
                ctx.rect(p.x, p.y, p.size, p.size);
            } else {
                // 圆形火花或烟雾
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            }
            ctx.fill();
        });
        ctx.restore();
    }
}

// 游戏控制器
export class GameController {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {Object} callbacks 回调函数：{ onCrash, onVictory, onScoreChange, onCheckpoint }
     */
    constructor(canvas, callbacks = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.callbacks = callbacks;

        // 核心实例
        this.audio = new AudioEngine();
        this.particles = new ParticleEngine();
        this.bike = null;
        
        // 赛道与K线数据
        this.rawStock = null;
        this.smoothedStock = null;
        this.trackPoints = []; // 游戏世界坐标中的赛道点
        
        // 控制键输入状态
        this.input = {
            gas: false,
            brake: false,
            tiltLeft: false,
            tiltRight: false,
            jump: false
        };

        // 视口摄像机
        this.camera = {
            x: 0,
            y: 0,
            zoom: 1.0,
            targetZoom: 1.0
        };

        // 关卡游玩数据
        this.score = 0;
        this.coins = [];       // 金币位置 [{x, y, active}]
        this.checkpoints = []; // 存档点 [{index, x, y, active, price}]
        
        this.timeElapsed = 0;
        this.crashesCount = 0;
        this.totalDistance = 0;
        this.virtualProfit = 0; // 累计虚拟收益 (基于收集金币处的K线涨跌幅估算)

        // 游戏状态循环
        this.lastTime = 0;
        this.animationFrameId = null;
        this.running = false;

        this.setupKeyboardListeners();
    }

    /**
     * 绑定键盘事件
     */
    setupKeyboardListeners() {
        const handleKey = (e, isDown) => {
            if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
                e.preventDefault(); // 防止按空格或方向键时网页滚动
            }

            switch (e.code) {
                case "KeyW":
                case "ArrowUp":
                    this.input.gas = isDown;
                    break;
                case "KeyS":
                case "ArrowDown":
                    this.input.brake = isDown;
                    break;
                case "KeyA":
                case "ArrowLeft":
                    this.input.tiltLeft = isDown;
                    break;
                case "KeyD":
                case "ArrowRight":
                    this.input.tiltRight = isDown;
                    break;
                case "Space":
                    this.input.jump = isDown;
                    if (isDown) this.audio.playJumpSound();
                    break;
                case "KeyR":
                    if (isDown) this.handleReset();
                    break;
            }
        };

        window.addEventListener('keydown', e => handleKey(e, true));
        window.addEventListener('keyup', e => handleKey(e, false));

        // 捕获物理引擎的特技事件与坠机事件
        window.addEventListener("stonkrider-trick", e => {
            this.score += e.detail.points;
            if (this.callbacks.onScoreChange) {
                this.callbacks.onScoreChange(this.score);
            }
            // 播放金币合成音
            this.audio.playCoinSound();
        });

        window.addEventListener("stonkrider-crash", e => {
            this.audio.playCrashSound();
            this.crashesCount++;
            
            // 生成大量的爆炸粒子
            const bikeX = this.bike.getX();
            const bikeY = this.bike.chassis.y;
            for (let i = 0; i < 40; i++) {
                this.particles.spawn(
                    bikeX + (Math.random() - 0.5) * 20,
                    bikeY + (Math.random() - 0.5) * 20,
                    (Math.random() - 0.5) * 12,
                    (Math.random() - 0.5) * 12 + 4,
                    Math.random() > 0.5 ? "#ff3366" : "#00ffcc",
                    Math.random() * 4 + 2,
                    1.2,
                    "wreck"
                );
            }

            if (this.callbacks.onCrash) {
                this.callbacks.onCrash(e.detail.reason);
            }
        });
    }

    /**
     * 加载新关卡
     * @param {Object} stockData K线数据 `{name, code, klines}`
     * @param {number} smoothWindow 平滑度窗口 (0=不平滑)
     */
    loadLevel(stockData, smoothWindow = 0) {
        this.rawStock = stockData;
        this.smoothedStock = smoothPrices(stockData.klines, smoothWindow);
        this.score = 0;
        this.timeElapsed = 0;
        this.crashesCount = 0;
        this.virtualProfit = 0;
        this.running = false;

        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }

        // 1. 生成赛道世界坐标
        this.generateTrackCoords();

        // 2. 初始化摩托车物理对象在起跑滑轨上 (x = 80 处)
        const startPoint = this.trackPoints[0];
        this.bike = new Motorcycle(80, startPoint.y + 30);

        // 3. 重置摄像机视口
        this.camera.x = this.bike.getX();
        this.camera.y = this.bike.chassis.y;
        this.camera.zoom = 0.95;

        // 4. 重绘一次预览
        this.drawFrame();
    }

    /**
     * 将 K 线数据转换为 2D 世界赛道折线坐标
     */
    generateTrackCoords() {
        const klines = this.smoothedStock;
        const len = klines.length;
        if (len === 0) return;

        // 找出最高、最低价
        const prices = klines.map(k => k.smoothedClose);
        const maxPrice = Math.max(...prices);
        const minPrice = Math.min(...prices);
        const startPrice = klines[0].smoothedClose || 1;

        // 根据区间波动率动态决定赛道的整体垂直落差范围，保证地形有足够的特技落差
        const volatility = (maxPrice - minPrice) / startPrice;
        // 稳定股起伏高度在 1200px 左右，妖股最大限制 3000px，让地形更立体、更具腾空感！
        const trackHeight = 1200 + Math.min(1800, volatility * 4500);

        const segmentWidth = 90; // 每个K线交易日的横向间距 (像素)
        const runwayWidth = 300; // 起跑缓冲轨道宽度 (增加宽度以提供足够的起跑加速滑行距离)

        // 1. 生成原始股票折线坐标 (起始点 x 从 runwayWidth 开始)
        const stockPoints = klines.map((k, i) => {
            const x = runwayWidth + i * segmentWidth;
            // 归一化映射：将最高低点差按比例拉满 trackHeight，保留真实的波峰波谷
            const priceRange = maxPrice - minPrice || 1;
            const ratio = (k.smoothedClose - minPrice) / priceRange;
            const y = ratio * trackHeight + 150; // 150 是基础世界高度
            return {
                x, y, 
                price: k.close,         // 存储原始未平滑的收盘价
                rawK: this.rawStock.klines[i] // 原始K线数据引用
            };
        });

        // 2. 限制相邻两天的垂直坡度差，最大落差控制在 segmentWidth * 1.0 (约 45 度斜坡)，防止产生无法爬越的直壁
        const maxSlopeStep = segmentWidth * 1.0; 
        for (let i = 1; i < stockPoints.length; i++) {
            const dy = stockPoints[i].y - stockPoints[i - 1].y;
            if (Math.abs(dy) > maxSlopeStep) {
                const clampedDy = Math.sign(dy) * maxSlopeStep;
                stockPoints[i].y = stockPoints[i - 1].y + clampedDy;
            }
        }

        // 3. 在左侧拼接一段水平直道作为起跑滑行缓冲 (x 从 0 到 runwayWidth)
        const runwayY = stockPoints[0].y;
        const runway = [
            { x: 0, y: runwayY, price: stockPoints[0].price, rawK: stockPoints[0].rawK },
            { x: 100, y: runwayY, price: stockPoints[0].price, rawK: stockPoints[0].rawK },
            { x: 200, y: runwayY, price: stockPoints[0].price, rawK: stockPoints[0].rawK }
        ];

        this.trackPoints = [...runway, ...stockPoints];

        // 4. 自动布置关卡收集金币与存档点
        this.generateLevelAssets(segmentWidth, 300);
    }

    /**
     * 在赛道上智能布设金币 (parabolic valley arcs) 和存档点 (checkpoints)
     */
    generateLevelAssets(segmentWidth, trackHeight) {
        this.coins = [];
        this.checkpoints = [];

        const points = this.trackPoints;
        const len = points.length;

        // 布设存档点：固定每个交易日段 (比如 40 个交易日) 布置一个
        const checkpointInterval = PHYSICS_CONFIG.checkpointInterval;
        for (let i = 0; i < len; i += checkpointInterval) {
            // 起点不是存档点，终点自动是存档点
            if (i > 0) {
                this.checkpoints.push({
                    index: i,
                    x: points[i].x,
                    y: points[i].y,
                    active: false,
                    price: points[i].price
                });
            }
        }
        
        // 确保终点是最后一个存档点 (或者是旗帜)
        if ((len - 1) % checkpointInterval !== 0) {
            this.checkpoints.push({
                index: len - 1,
                x: points[len - 1].x,
                y: points[len - 1].y,
                active: false,
                price: points[len - 1].price
            });
        }

        // 布设金币：
        // 规则A：每当股价暴涨时，在冲坡顶端放金币
        // 规则B：当遇到股价下跌形成“V”字形山谷时，生成抛物线金币弧线，引导玩家在山谷里飞跃！
        for (let i = 2; i < len - 2; i++) {
            const pPrev = points[i - 1];
            const pCurr = points[i];
            const pNext = points[i + 1];

            // 局部低谷 (山谷) -> 在山谷上方布置抛物线飞跃金币
            if (pPrev.y > pCurr.y && pNext.y > pCurr.y) {
                // 计算山谷宽度
                const valleyLeftIdx = Math.max(0, i - 2);
                const valleyRightIdx = Math.min(len - 1, i + 2);
                const leftX = points[valleyLeftIdx].x;
                const leftY = points[valleyLeftIdx].y;
                const rightX = points[valleyRightIdx].x;
                const rightY = points[valleyRightIdx].y;

                // 抛物线高点在中间山谷上方
                const midX = (leftX + rightX) / 2;
                const midY = Math.max(leftY, rightY) + 60; // 腾空高度

                // 生成 3 个抛物线金币
                for (let step = 1; step <= 3; step++) {
                    const ratio = step / 4;
                    const cx = leftX + (rightX - leftX) * ratio;
                    // 抛物线方程 y = a(x-h)^2 + k
                    const h = midX;
                    const k = midY;
                    const a = (leftY - k) / Math.pow(leftX - h, 2);
                    const cy = a * Math.pow(cx - h, 2) + k;
                    
                    this.coins.push({ x: cx, y: cy, active: true });
                }
                
                // 跳过这几个点避免重复布币
                i += 2;
            } else if (i % 6 === 0) {
                // 默认每隔 6 个交易日在股价轨道上方 25px 布置一个零散金币
                this.coins.push({ x: pCurr.x, y: pCurr.y + 25, active: true });
            }
        }
    }

    /**
     * 启动游戏循环
     */
    start() {
        if (this.running) return;
        this.running = true;
        this.lastTime = performance.now();
        this.audio.init(); // 激活音频引擎
        
        const loop = (timestamp) => {
            if (!this.running) return;
            
            let dt = (timestamp - this.lastTime) / 1000;
            // 夹紧 dt 避免浏览器切到后台再切回来后物理计算溢出
            dt = Math.min(0.1, dt);
            this.lastTime = timestamp;

            this.update(dt);
            this.drawFrame();

            this.animationFrameId = requestAnimationFrame(loop);
        };
        this.animationFrameId = requestAnimationFrame(loop);
    }

    /**
     * 暂停/停止游戏循环
     */
    stop() {
        this.running = false;
        this.audio.stopEngine();
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
    }

    /**
     * 重置或复活
     */
    handleReset() {
        // 重置到最近激活的存档点，若无激活的存档点则重置到起跑轨道 x = 80 处
        let respawnX = 80;
        let respawnY = this.trackPoints[0].y + 30;

        // 寻找最新的已激活存档点
        let latestActiveCp = null;
        for (let i = this.checkpoints.length - 1; i >= 0; i--) {
            if (this.checkpoints[i].active) {
                latestActiveCp = this.checkpoints[i];
                break;
            }
        }

        if (latestActiveCp) {
            respawnX = latestActiveCp.x;
            respawnY = latestActiveCp.y + 30;
        }

        this.bike.reset(respawnX, respawnY);
        this.audio.init();
        
        // 扣除一点分数作为复活惩罚 (比如 100分，最低为0)
        this.score = Math.max(0, this.score - 100);
        if (this.callbacks.onScoreChange) {
            this.callbacks.onScoreChange(this.score);
        }

        // 清除碰撞爆炸残存的粒子
        this.particles.particles = [];
        this.running = true;
        this.start();
    }

    /**
     * 物理与状态更新
     */
    update(dt) {
        if (!this.bike) return;

        // 1. 更新物理位置与状态
        // 物理子循环：每帧运行 2 次以提高物理约束逼真度，减小穿透概率
        const subSteps = 2;
        const subDt = dt / subSteps;
        for (let step = 0; step < subSteps; step++) {
            this.bike.update(this.input, this.trackPoints, subDt);
        }

        // 更新粒子系统
        this.particles.update(dt);

        if (this.bike.crashed) {
            this.audio.stopEngine();
            return;
        }

        // 2. 统计用时
        this.timeElapsed += dt;

        // 3. 控制发动机音效
        const forwardSpeed = this.bike.speed;
        this.audio.setEnginePitchAndVolume(forwardSpeed, this.input.gas);

        // 4. 碰撞与收集金币检测
        const bikeX = this.bike.getX();
        const bikeY = this.bike.chassis.y;
        
        this.coins.forEach(coin => {
            if (coin.active) {
                // 轮子或车身碰到金币
                const dx = coin.x - bikeX;
                const dy = coin.y - bikeY;
                const distToChassis = Math.sqrt(dx * dx + dy * dy);
                
                const dxB = coin.x - this.bike.backWheel.x;
                const dyB = coin.y - this.bike.backWheel.y;
                const distToBack = Math.sqrt(dxB * dxB + dyB * dyB);

                const dxF = coin.x - this.bike.frontWheel.x;
                const dyF = coin.y - this.bike.frontWheel.y;
                const distToFront = Math.sqrt(dxF * dxF + dyF * dyF);

                if (distToChassis < 28 || distToBack < 18 || distToFront < 18) {
                    coin.active = false;
                    this.score += 100;
                    this.audio.playCoinSound();
                    
                    if (this.callbacks.onScoreChange) {
                        this.callbacks.onScoreChange(this.score);
                    }

                    // 喷射金币粒子
                    for (let p = 0; p < 8; p++) {
                        this.particles.spawn(
                            coin.x, coin.y,
                            (Math.random() - 0.5) * 5,
                            (Math.random() - 0.5) * 5,
                            "#fadb14", // 金黄色
                            Math.random() * 3 + 1,
                            0.6
                        );
                    }
                }
            }
        });

        // 5. 存档点判定
        this.checkpoints.forEach(cp => {
            if (!cp.active && bikeX >= cp.x) {
                cp.active = true;
                this.audio.playCheckpointSound();
                this.score += 200; // 激活存档点加200分
                
                if (this.callbacks.onScoreChange) {
                    this.callbacks.onScoreChange(this.score);
                }
                
                if (this.callbacks.onCheckpoint) {
                    this.callbacks.onCheckpoint(cp);
                }

                // 喷射彩带粒子
                for (let p = 0; p < 15; p++) {
                    this.particles.spawn(
                        cp.x, cp.y + 15,
                        (Math.random() - 0.5) * 4,
                        (Math.random() - 0.5) * 6 + 4,
                        Math.random() > 0.5 ? "#ff3366" : "#00ffcc",
                        Math.random() * 3 + 1,
                        1.0
                    );
                }
            }
        });

        // 6. 胜利/通关判定
        if (this.bike.victory) {
            this.running = false;
            this.audio.stopEngine();
            this.audio.playVictorySound();
            if (this.callbacks.onVictory) {
                this.callbacks.onVictory(this.score, this.timeElapsed);
            }
            return;
        }

        // 7. 发动机尾气喷火粒子
        if (this.input.gas && Math.random() < 0.35) {
            const angle = this.bike.getAngle();
            // 尾烟喷嘴在后轮稍上方
            const exhaustX = this.bike.backWheel.x - Math.cos(angle) * 8 + Math.sin(angle) * 8;
            const exhaustY = this.bike.backWheel.y - Math.sin(angle) * 8 - Math.cos(angle) * 8;
            
            this.particles.spawn(
                exhaustX, exhaustY,
                -Math.cos(angle) * (2 + Math.random() * 2) + (Math.random() - 0.5) * 0.5,
                -Math.sin(angle) * (2 + Math.random() * 2) + (Math.random() - 0.5) * 0.5,
                Math.random() > 0.4 ? "#ff4d4f" : "#ff9c6e", // 红色/橙色尾烟
                Math.random() * 3 + 1,
                0.5,
                "smoke"
            );
        }

        // 8. 车轮与地面摩擦的火花粒子
        if (this.bike.backWheel.grounded && this.input.gas && Math.random() < 0.25) {
            this.particles.spawn(
                this.bike.backWheel.x, this.bike.backWheel.y - 10,
                -Math.cos(this.bike.getAngle()) * 3 + (Math.random() - 0.5),
                2 + Math.random() * 2,
                "#52c41a", // A股红绿摩擦
                1.5, 0.4, "spark"
            );
        }

        // 9. 平滑更新摄像机
        this.updateCamera(dt);
    }

    /**
     * 更新视口摄像机
     */
    updateCamera(dt) {
        // 目标是让摄像机中心正对自行车位置
        const targetX = this.bike.getX();
        const targetY = this.bike.chassis.y;

        // 平滑跟踪 LERP
        this.camera.x += (targetX - this.camera.x) * 0.08;
        this.camera.y += (targetY - this.camera.y) * 0.08;

        // 根据车速动态缩放视口
        const maxZoomSpeed = 15;
        const speedRatio = Math.min(1.0, this.bike.speed / maxZoomSpeed);
        this.camera.targetZoom = 1.0 - speedRatio * 0.18; // 速度越快，视野越开阔
        
        this.camera.zoom += (this.camera.targetZoom - this.camera.zoom) * 0.05;
    }

    /**
     * 绘制一帧画面
     */
    drawFrame() {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;

        // 清空画布
        ctx.fillStyle = "#0c0d12"; // 极暗夜空灰
        ctx.fillRect(0, 0, width, height);

        // 1. 绘制网格背景 (类似证券交易图的虚线背景)
        this.drawBackgroundGrid();

        // 2. 进入摄像机裁剪坐标空间
        ctx.save();
        
        // 坐标变换：平移、缩放。物理坐标中 +y 向上，HTML Canvas 中 Y 向下。
        // 将骑士位置映射到屏幕横向 1/3、纵向居中的位置，并在 Y 轴施加负向缩放反转坐标轴。
        ctx.translate(width / 3, height / 2);
        ctx.scale(this.camera.zoom, -this.camera.zoom);
        ctx.translate(-this.camera.x, -this.camera.y);

        // 2.5 绘制大背景水印 (在世界空间，车身上方漂浮)
        this.drawBackgroundWatermark();

        // 3. 绘制赛道
        this.drawTrack();

        // 4. 绘制收集品与存档点
        this.drawLevelAssets();

        // 5. 绘制摩托车
        if (this.bike && !this.bike.crashed) {
            this.drawMotorcycle();
        }

        // 6. 绘制粒子
        this.particles.draw(ctx);

        ctx.restore();

        // 7. 绘制顶层 HUD (直接绘制于屏幕空间)
        this.drawHUD();
    }

    /**
     * 绘制静态背景网格
     */
    drawBackgroundGrid() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        ctx.save();
        ctx.strokeStyle = "rgba(45, 55, 72, 0.25)"; // 浅色虚线
        ctx.lineWidth = 1;

        // 视口平移滚动，带视差效果
        const offsetX = -(this.camera.x * this.camera.zoom * 0.15) % 60;
        const offsetY = (this.camera.y * this.camera.zoom * 0.15) % 60;

        ctx.beginPath();
        // 竖线
        for (let x = offsetX; x < w; x += 60) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
        }
        // 横线
        for (let y = offsetY; y < h; y += 60) {
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
        }
        ctx.stroke();

        // 绘制淡淡的底纹 MACD 多头线段装饰 (让页面充满炒股感!)
        ctx.restore();
    }

    /**
     * 绘制赛道背景大字水印 (世界空间，滚动展示)
     */
    drawBackgroundWatermark() {
        const ctx = this.ctx;
        if (!this.rawStock || this.trackPoints.length < 2) return;

        ctx.save();
        // 因为世界坐标系 Y 轴是反向的 (+y 向上)，绘制文字前需要将 Y 轴反转一次，以防文字倒置
        ctx.scale(1, -1);
        ctx.font = "italic bold 90px Outfit, sans-serif";
        ctx.fillStyle = "rgba(255, 255, 255, 0.022)"; // 非常淡的水印，融入暗黑色网格
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";

        const label = `${this.rawStock.name}  ${this.rawStock.code}`;
        // 沿赛道横向复制多个水印大字 (每 1600 像素绘制一个)
        const totalX = this.trackPoints[this.trackPoints.length - 1].x;
        for (let gx = 100; gx < totalX; gx += 1600) {
            // 动态查找到 gx 坐标处附近的赛道世界坐标高度，并将文字放置于赛道上方 120 像素处
            const idx = Math.min(this.trackPoints.length - 1, Math.floor((gx / totalX) * (this.trackPoints.length - 1)));
            const trackY = this.trackPoints[idx].y;
            const textY = trackY + 120; // 始终悬浮在赛道上方 120 像素的天空中
            
            // 注意 Y 世界坐标是正的，在 scale(1, -1) 反转下需要乘以 -1
            ctx.fillText(label, gx, -textY);
        }
        ctx.restore();
    }

    /**
     * 绘制发光的 A 股行情赛道
     */
    drawTrack() {
        const ctx = this.ctx;
        const points = this.trackPoints;
        if (points.length < 2) return;

        ctx.save();
        
        // 双层画法：第一层是底层粗发光，第二层是明亮的细线
        // 1. 底层粗发光
        ctx.lineWidth = 8;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];

            // A 股红涨绿跌：对比当天价格和前一天价格
            const isUp = p2.price >= p1.price;
            const color = isUp ? "#ff4d4f" : "#52c41a"; // 经典红涨绿跌
            
            ctx.strokeStyle = color;
            ctx.shadowBlur = 12;
            ctx.shadowColor = color;

            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
        }

        // 2. 表层亮细线
        ctx.shadowBlur = 0;
        ctx.lineWidth = 3.5;
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];

            const isUp = p2.price >= p1.price;
            ctx.strokeStyle = isUp ? "#ffccc7" : "#d9f7be"; // 稍浅的颜色使中心线明亮

            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
        }

        ctx.restore();
    }

    /**
     * 绘制金币与存档旗帜
     */
    drawLevelAssets() {
        const ctx = this.ctx;

        ctx.save();

        // 1. 绘制金币
        this.coins.forEach(coin => {
            if (!coin.active) return;
            
            // 发光黄色
            ctx.fillStyle = "#fadb14";
            ctx.strokeStyle = "#fffb8f";
            ctx.lineWidth = 1.5;
            ctx.shadowBlur = 8;
            ctx.shadowColor = "#fadb14";

            // 绘制自旋转金币效果 (利用时间做简单的正弦宽度缩放)
            ctx.save();
            ctx.translate(coin.x, coin.y);
            const scale = Math.abs(Math.sin(performance.now() / 200));
            ctx.scale(scale, 1.0); // 伪 3D 自转
            
            ctx.beginPath();
            ctx.arc(0, 0, 7, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            
            // 绘制中间的美元符号或符号 '¥'
            ctx.fillStyle = "#d4b106";
            ctx.scale(1, -1); // 恢复 Y 轴镜像以正确绘制字符
            ctx.font = "bold 8px Courier New";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("¥", 0, 0);
            
            ctx.restore();
        });

        // 2. 绘制存档点旗帜
        this.checkpoints.forEach(cp => {
            ctx.save();
            ctx.shadowBlur = cp.active ? 10 : 0;
            ctx.shadowColor = cp.active ? "#ff4d4f" : "gray";

            // 旗杆
            ctx.strokeStyle = "#8c8c8c";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(cp.x, cp.y);
            ctx.lineTo(cp.x, cp.y + 40);
            ctx.stroke();

            // 旗帜面
            ctx.fillStyle = cp.active ? "#ff3366" : "#434343";
            ctx.beginPath();
            ctx.moveTo(cp.x, cp.y + 40);
            ctx.lineTo(cp.x + 22, cp.y + 30);
            ctx.lineTo(cp.x, cp.y + 20);
            ctx.closePath();
            ctx.fill();

            // 显示在存档点处的股价
            ctx.scale(1, -1);
            ctx.font = "11px Outfit, sans-serif";
            ctx.fillStyle = cp.active ? "#00ffcc" : "#8c8c8c";
            ctx.fillText(`¥${cp.price.toFixed(2)}`, cp.x + 5, -cp.y - 45);

            ctx.restore();
        });

        ctx.restore();
    }

    /**
     * 绘制赛博朋克风摩托车
     */
    drawMotorcycle() {
        const ctx = this.ctx;
        const p0 = this.bike.backWheel;
        const p1 = this.bike.frontWheel;
        const p2 = this.bike.chassis;

        ctx.save();

        // 1. 绘制后轮和前轮 (物理坐标)
        this.drawWheel(p0);
        this.drawWheel(p1);

        // 2. 绘制悬吊避震支架 (车轮到车身质心)
        ctx.strokeStyle = "#595959";
        ctx.lineWidth = 4;
        ctx.beginPath();
        // 后轮避震
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p2.x, p2.y);
        // 前轮避震
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        // 弹簧悬挂钢丝圈特效
        this.drawSpring(p0, p2);
        this.drawSpring(p1, p2);

        // 3. 绘制车身底盘 (Chassis) - 倒角几何多边形
        const angle = this.bike.getAngle();
        ctx.save();
        ctx.translate(p2.x, p2.y);
        ctx.rotate(angle);

        // 绘制车座与车舱框架
        ctx.fillStyle = "rgba(0, 240, 255, 0.9)";
        ctx.strokeStyle = "#00f0ff";
        ctx.lineWidth = 2;
        ctx.shadowBlur = 10;
        ctx.shadowColor = "#00f0ff";

        ctx.beginPath();
        // 以 (0,0) 为质心
        ctx.moveTo(-18, -4);  // 车尾
        ctx.lineTo(0, -6);    // 底盘
        ctx.lineTo(15, 3);    // 车头避震连接点
        ctx.lineTo(10, 8);    // 前挡板
        ctx.lineTo(-5, 5);    // 车座前
        ctx.lineTo(-15, 6);   // 车座后
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // ==========================================
        // 绘制“牛头熊身”卡通骑手 (Bull Head & Bear Body Rider)
        // ==========================================
        ctx.save();
        ctx.shadowBlur = 4;
        ctx.shadowColor = "#ffffff";

        // 1. 绘制熊身 (Bear Body - 粗壮棕色躯干与四肢)
        ctx.fillStyle = "#A0522D"; // 赭石色/棕色 (Bear torso)
        ctx.strokeStyle = "#8B4513"; // 深棕色轮廓
        ctx.lineWidth = 1.5;

        // 熊的圆滚滚身体 (臀部贴车座)
        ctx.beginPath();
        ctx.arc(-6, 9, 6.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // 熊的粗壮手臂 (从肩部 (-5, 12) 伸向车把 (5, 7))
        ctx.strokeStyle = "#A0522D";
        ctx.lineWidth = 4;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(-4, 12);
        ctx.quadraticCurveTo(0, 11, 5, 7); // 手臂曲线
        ctx.stroke();
        
        // 熊的粗壮腿部 (臀部到踏板 (-2, 0))
        ctx.beginPath();
        ctx.moveTo(-6, 6);
        ctx.quadraticCurveTo(-6, 3, -2, 0); // 腿部曲线
        ctx.stroke();

        // 2. 绘制牛头 (Bull Head - 头部 + 脸部点缀)
        ctx.fillStyle = "#8B4513"; // 深棕色牛头
        ctx.strokeStyle = "#5C2E0B";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(-5, 17, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // 牛鼻子/嘴巴部分 (浅色突出)
        ctx.fillStyle = "#CD853F";
        ctx.beginPath();
        ctx.arc(-4, 16, 2, 0, Math.PI * 2);
        ctx.fill();

        // 牛的眼睛 (小黑点)
        ctx.fillStyle = "#000000";
        ctx.beginPath();
        ctx.arc(-3, 17.5, 0.6, 0, Math.PI * 2);
        ctx.fill();

        // 3. 绘制金色牛角 (Bull Horns - 代表牛市冲天的金黄弯角)
        ctx.fillStyle = "#FFD700"; // 纯金色 (Gold)
        ctx.strokeStyle = "#FFA500"; // 橙色轮廓
        ctx.lineWidth = 1;
        ctx.shadowColor = "#FFD700";
        ctx.shadowBlur = 8; // 金光闪闪！

        // 左牛角 (向左上弯曲)
        ctx.beginPath();
        ctx.moveTo(-7.5, 19);
        ctx.quadraticCurveTo(-11, 23, -8, 24); // 角外侧弯曲
        ctx.quadraticCurveTo(-7.5, 21, -6.5, 19.5); // 角内侧
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 右牛角 (向右上弯曲)
        ctx.beginPath();
        ctx.moveTo(-3, 19.5);
        ctx.quadraticCurveTo(0, 23, 2, 23); // 角外侧弯曲
        ctx.quadraticCurveTo(-1, 21, -2, 19); // 角内侧
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.restore();

        ctx.restore();
        ctx.restore();
    }

    drawWheel(wheel) {
        const ctx = this.ctx;
        ctx.save();

        // 轮外廓
        ctx.strokeStyle = "#00ffcc";
        ctx.lineWidth = 3.5;
        ctx.shadowBlur = 8;
        ctx.shadowColor = "#00ffcc";
        ctx.fillStyle = "#141414";

        ctx.beginPath();
        ctx.arc(wheel.x, wheel.y, wheel.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // 轮辐 (Spokes) - 随轮子滚动而旋转
        // Verlet 积分中，由于我们不显式计算轮子转角，可以用位移 x 估算一个滚动角度
        const rollAngle = wheel.x / wheel.radius;
        
        ctx.strokeStyle = "rgba(0, 255, 200, 0.4)";
        ctx.lineWidth = 1.5;
        ctx.shadowBlur = 0;
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
            const a = rollAngle + i * (Math.PI / 2);
            ctx.moveTo(wheel.x, wheel.y);
            ctx.lineTo(
                wheel.x + Math.cos(a) * wheel.radius,
                wheel.y + Math.sin(a) * wheel.radius
            );
        }
        ctx.stroke();

        ctx.restore();
    }

    drawSpring(pA, pB) {
        const ctx = this.ctx;
        ctx.save();
        
        ctx.strokeStyle = "#b5b5b5";
        ctx.lineWidth = 1.5;
        ctx.beginPath();

        const segments = 8;
        const dx = pB.x - pA.x;
        const dy = pB.y - pA.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        
        const ux = dx / len;
        const uy = dy / len;
        const nx = -uy; // 垂直于连接线的法向，用于绘制弹簧抖动
        const ny = ux;

        ctx.moveTo(pA.x, pA.y);
        
        // 沿线段方向以 Z 字形绘制弹簧圈
        for (let i = 0; i <= segments; i++) {
            const ratio = i / segments;
            const px = pA.x + dx * ratio;
            const py = pA.y + dy * ratio;

            if (i > 0 && i < segments) {
                // 向左右交替抖动
                const amplitude = (i % 2 === 0 ? 5 : -5);
                ctx.lineTo(px + nx * amplitude, py + ny * amplitude);
            } else {
                ctx.lineTo(px, py);
            }
        }
        ctx.stroke();
        ctx.restore();
    }

    /**
     * 绘制屏幕 HUD 覆盖层
     */
    drawHUD() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        
        ctx.save();

        // 1. 顶部当前特技成就提示 (发光金字)
        if (this.bike.trickName) {
            ctx.font = "italic bold 24px Outfit, sans-serif";
            ctx.fillStyle = "#ffd666";
            ctx.textAlign = "center";
            ctx.shadowBlur = 10;
            ctx.shadowColor = "#ffd666";
            ctx.fillText(this.bike.trickName, w / 2, 85);
        }

        // 2. 右上角迷你小地图 (展示赛道全貌与骑士所在位置点)
        this.drawMiniMap();

        ctx.restore();
    }

    /**
     * 绘制右上角微缩地图
     */
    drawMiniMap() {
        const ctx = this.ctx;
        const pts = this.trackPoints;
        if (pts.length < 2) return;

        const mapW = 160;
        const mapH = 45;
        const mapX = this.canvas.width - mapW - 20;
        const mapY = 20;

        ctx.save();
        
        // 暗灰毛玻璃效果底盘
        ctx.fillStyle = "rgba(22, 28, 45, 0.75)";
        ctx.strokeStyle = "rgba(74, 85, 104, 0.4)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(mapX, mapY, mapW, mapH, 6);
        ctx.fill();
        ctx.stroke();

        // 映射全赛道折线
        const totalX = pts[pts.length - 1].x;
        const prices = pts.map(p => p.price);
        const maxP = Math.max(...prices);
        const minP = Math.min(...prices);
        const rangeP = maxP - minP || 1;

        ctx.beginPath();
        pts.forEach((p, idx) => {
            const rx = mapX + 5 + (p.x / totalX) * (mapW - 10);
            const ry = mapY + mapH - 5 - ((p.price - minP) / rangeP) * (mapH - 10);
            if (idx === 0) ctx.moveTo(rx, ry);
            else ctx.lineTo(rx, ry);
        });
        ctx.strokeStyle = "rgba(0, 240, 255, 0.6)";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // 绘制骑士当前在小地图上的标记红点
        const bikeX = this.bike.getX();
        const ratioX = Math.max(0, Math.min(1.0, bikeX / totalX));
        const bikeKIdx = Math.min(pts.length - 1, Math.floor(ratioX * (pts.length - 1)));
        
        const bx = mapX + 5 + ratioX * (mapW - 10);
        const by = mapY + mapH - 5 - ((pts[bikeKIdx].price - minP) / rangeP) * (mapH - 10);

        ctx.fillStyle = "#ff4d4f";
        ctx.shadowBlur = 6;
        ctx.shadowColor = "#ff4d4f";
        ctx.beginPath();
        ctx.arc(bx, by, 3.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}
