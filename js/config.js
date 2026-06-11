/**
 * StonkRider A股版 - 全局配置文件
 */

// 预设热门赛道，用于主页快捷展示
export const TRENDING_TRACKS = [
    {
        name: "上证指数",
        code: "000001",
        market: 1, // 1 表示沪市 (SH)，0 表示深市 (SZ)
        secid: "1.000001",
        difficulty: "Easy",
        difficultyText: "简单",
        desc: "大盘风向标，走势相对平缓，适合新手练手",
        change: "+15.4%"
    },
    {
        name: "贵州茅台",
        code: "600519",
        market: 1,
        secid: "1.600519",
        difficulty: "Medium",
        difficultyText: "普通",
        desc: "A股股王，价值投资代表，坡度绵延稳健",
        change: "+45.2%"
    },
    {
        name: "比亚迪",
        code: "002594",
        market: 0,
        secid: "0.002594",
        secid_full: "0.002594",
        difficulty: "Medium",
        difficultyText: "普通",
        desc: "新能源车龙头，波段起伏明显，有一定挑战性",
        change: "+89.1%"
    },
    {
        name: "宁德时代",
        code: "300750",
        market: 0,
        secid: "0.300750",
        secid_full: "0.300750",
        difficulty: "Hard",
        difficultyText: "困难",
        desc: "电池巨头，万亿锂电过山车，急弯与大坡度频出",
        change: "-32.4%"
    },
    {
        name: "东方财富",
        code: "300059",
        market: 0,
        secid: "0.300059",
        secid_full: "0.300059",
        difficulty: "Insane",
        difficultyText: "地狱",
        desc: "券商弹性先锋，牛市发动机，走势极其剧烈，针状行情多",
        change: "+124.6%"
    }
];

// 物理引擎参数配置
export const PHYSICS_CONFIG = {
    gravity: 0.22,          // 重力 (略微降低，提供更好的跃空手感)
    dampening: 0.985,       // 空气阻力 (速度衰减)
    wheelbase: 36,          // 轴距 (前后轮间距)
    suspensionLength: 22,   // 悬挂弹簧原长
    suspensionStiffness: 0.35, // 悬挂刚度 (Verlet拉伸约束强度)
    bikeScale: 1.0,         // 车身缩放比例
    
    // 轮子参数
    wheelRadius: 10,        // 车轮半径
    wheelMass: 1.0,         // 车轮质量
    chassisMass: 2.0,       // 车身质量
    
    // 操控参数
    enginePower: 0.45,      // 引擎马力 (后轮加速力，增加以轻松爬坡)
    brakingPower: 0.08,     // 刹车力
    tiltTorque: 0.05,       // 压车身扭矩 (A/D 键)
    jumpImpulse: 3.5,       // 跳跃冲量
    
    // 碰撞与接触
    groundFriction: 0.05,   // 地面摩擦力
    bounce: 0.1,            // 地面反弹系数
    
    // 游戏性参数
    checkpointInterval: 40, // 多少个K线点设置一个存档点
    maxCrashes: 999
};

// 简单的种子伪随机数生成器，确保确定性生成
function createSeededRandom(seedString) {
    let seed = 0;
    for (let i = 0; i < seedString.length; i++) {
        seed = (seed << 5) - seed + seedString.charCodeAt(i);
        seed |= 0; // 转换为32位有符号整数
    }
    return function() {
        // LCG 算法
        seed = (seed * 1664525 + 1013904223) | 0;
        return (seed >>> 0) / 0xffffffff;
    };
}

// 预设离线 K 线数据生成器 (当没有 API 或本地双击运行时使用)
export function generateOfflineKlines(code, pointsCount = 180) {
    let basePrice = 100;
    let volatility = 0.03;
    let trend = 0.0002;
    
    if (code === "000001") { // 上证指数
        basePrice = 3000;
        volatility = 0.008;
        trend = 0.0001;
    } else if (code === "600519") { // 贵州茅台
        basePrice = 1500;
        volatility = 0.012;
        trend = 0.0003;
    } else if (code === "002594") { // 比亚迪
        basePrice = 250;
        volatility = 0.02;
        trend = 0.0005;
    } else if (code === "300750") { // 宁德时代
        basePrice = 400;
        volatility = 0.025;
        trend = -0.0002;
    } else if (code === "300059") { // 东方财富
        basePrice = 20;
        volatility = 0.035;
        trend = 0.0008;
    }
    
    // 使用股票代码与点数拼接作为种子
    const random = createSeededRandom(code + "_" + pointsCount);
    
    const klines = [];
    let currentPrice = basePrice;
    let date = new Date(new Date().getTime() - pointsCount * 24 * 60 * 60 * 1000);
    
    for (let i = 0; i < pointsCount; i++) {
        date.setDate(date.getDate() + 1);
        // 跳过周末
        if (date.getDay() === 0 || date.getDay() === 6) {
            i--;
            continue;
        }
        
        const dateStr = date.toISOString().split('T')[0];
        const prevPrice = currentPrice;
        
        // 使用正弦波叠随机游走生成曲线
        const sineWave = Math.sin(i / 15) * (basePrice * volatility * 1.5);
        const randomFactor = (random() - 0.5 + trend) * (basePrice * volatility);
        
        // 东方财富特殊针状行情
        let spike = 0;
        if (code === "300059" && random() < 0.08) {
            spike = (random() - 0.5) * (basePrice * volatility * 4);
        }
        
        currentPrice = currentPrice + randomFactor + spike;
        // 叠加正弦以形成起伏的丘陵/谷底赛道
        let finalPrice = Math.max(basePrice * 0.1, currentPrice + sineWave);
        
        const open = finalPrice * (1 + (random() - 0.5) * 0.01);
        const close = finalPrice;
        const high = Math.max(open, close) * (1 + random() * 0.015);
        const low = Math.min(open, close) * (1 - random() * 0.015);
        const volume = Math.floor(random() * 1000000) + 100000;
        const amount = volume * finalPrice;
        const amplitude = ((high - low) / low) * 100;
        const pctChange = ((close - prevPrice) / prevPrice) * 100;
        const diffPrice = close - prevPrice;
        const turnover = random() * 5;
        
        // 东财格式: "日期,开盘,收盘,最高,最低,成交量,成交额,振幅,涨跌幅,涨跌额,换手率"
        klines.push(`${dateStr},${open.toFixed(2)},${close.toFixed(2)},${high.toFixed(2)},${low.toFixed(2)},${volume},${amount.toFixed(2)},${amplitude.toFixed(2)},${pctChange.toFixed(2)},${diffPrice.toFixed(2)},${turnover.toFixed(2)}`);
    }
    return klines;
}
