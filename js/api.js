import { generateOfflineKlines } from './config.js';

/**
 * 获取股票数据并解析为对象数组
 * @param {string} code 股票代码 (6位)
 * @param {string} period 周期：'3M', '6M', '1Y', 'ALL'
 * @returns {Promise<{name: string, code: string, klines: Array}>}
 */
export async function fetchStockData(code, period = '1Y', secid = '') {
    // 决定获取的数据点数
    let limit = 240; // 默认 1 年约 240 个交易日
    if (period === '3M') limit = 60;
    else if (period === '6M') limit = 120;
    else if (period === '1Y') limit = 240;
    else if (period === 'ALL') limit = 600;

    // 检查是本地运行还是在线运行
    const isLocal = window.location.protocol === 'file:';

    // 如果是本地 file 协议，直接使用本地生成的数据
    if (isLocal && !window.forceCloudflareAPI) {
        console.log(`[API] 检测到本地/离线环境，为股票 ${code} 使用生成的数据.`);
        const mockRawLines = generateOfflineKlines(code, limit);
        return parseEastmoneyData({
            data: {
                name: getStockNameByCode(code, secid),
                code: code,
                klines: mockRawLines
            }
        });
    }

    try {
        // 请求 Cloudflare Serverless Function 代理
        const response = await fetch(`/api/stock?code=${code}&secid=${secid}&limit=${limit}`);
        if (!response.ok) {
            throw new Error(`HTTP 错误: ${response.status}`);
        }
        const json = await response.json();
        if (!json || json.rc !== 0 || !json.data || !json.data.klines) {
            throw new Error('返回的数据格式无效或无数据');
        }
        return parseEastmoneyData(json);
    } catch (err) {
        console.warn(`[API] 联机获取数据失败，降级为生成模式. 原因: ${err.message}`);
        const mockRawLines = generateOfflineKlines(code, limit);
        return parseEastmoneyData({
            data: {
                name: getStockNameByCode(code, secid),
                code: code,
                klines: mockRawLines
            }
        });
    }
}

/**
 * 模糊搜索股票列表 (纯前端简易实现，或请求东财搜索接口)
 * @param {string} keyword 关键词 (代码或拼音或中文)
 * @returns {Promise<Array>}
 */
export async function searchStocks(keyword) {
    if (!keyword || keyword.trim() === "") return [];
    
    const isLocal = window.location.protocol === 'file:';

    if (isLocal && !window.forceCloudflareAPI) {
        // 本地离线环境只返回几个预设的匹配
        const presets = [
            { code: "000001", name: "平安银行", secid: "0.000001" },
            { code: "000001", name: "上证指数", secid: "1.000001" },
            { code: "600519", name: "贵州茅台", secid: "1.600519" },
            { code: "002594", name: "比亚迪", secid: "0.002594" },
            { code: "300750", name: "宁德时代", secid: "0.300750" },
            { code: "300059", name: "东方财富", secid: "0.300059" }
        ];
        return presets.filter(s => s.code.includes(keyword) || s.name.includes(keyword));
    }

    try {
        const response = await fetch(`/api/stock?search=${encodeURIComponent(keyword)}`);
        if (!response.ok) throw new Error("Search failed");
        return await response.json();
    } catch (err) {
        console.warn(`[API] 搜索请求失败，降级本地匹配: ${err.message}`);
        const presets = [
            { code: "000001", name: "平安银行", secid: "0.000001" },
            { code: "000001", name: "上证指数", secid: "1.000001" },
            { code: "600519", name: "贵州茅台", secid: "1.600519" },
            { code: "002594", name: "比亚迪", secid: "0.002594" },
            { code: "300750", name: "宁德时代", secid: "0.300750" },
            { code: "300059", name: "东方财富", secid: "0.300059" }
        ];
        return presets.filter(s => s.code.includes(keyword) || s.name.includes(keyword));
    }
}

/**
 * 解析东财的 K 线 JSON 数据
 */
function parseEastmoneyData(json) {
    const data = json.data;
    const rawKlines = data.klines;
    
    const parsedKlines = rawKlines.map(line => {
        // 格式: "日期,开盘,收盘,最高,最低,成交量,成交额,振幅,涨跌幅,涨跌额,换手率"
        const parts = line.split(',');
        return {
            date: parts[0],
            open: parseFloat(parts[1]),
            close: parseFloat(parts[2]),
            high: parseFloat(parts[3]),
            low: parseFloat(parts[4]),
            volume: parseFloat(parts[5]),
            amount: parseFloat(parts[6]),
            amplitude: parseFloat(parts[7]),
            pctChange: parseFloat(parts[8]),
            change: parseFloat(parts[9]),
            turnover: parseFloat(parts[10])
        };
    });

    return {
        name: data.name || "未知股票",
        code: data.code || "000000",
        klines: parsedKlines
    };
}

/**
 * 离线模式下代码与名字映射
 */
function getStockNameByCode(code, secid = "") {
    if (code === "000001") {
        return secid.startsWith("1") ? "上证指数" : "平安银行";
    }
    const map = {
        "600519": "贵州茅台",
        "002594": "比亚迪",
        "300750": "宁德时代",
        "300059": "东方财富"
    };
    return map[code] || "自选股票 " + code;
}

/**
 * 滑动平均算法平滑股价曲线
 * @param {Array} klines 原始 K 线数组
 * @param {number} windowSize 平滑窗口大小 (例如 5 天均线, 10 天均线)
 * @returns {Array} 包含了 smoothedClose 字段的新数组
 */
export function smoothPrices(klines, windowSize = 5) {
    if (windowSize <= 1) {
        return klines.map(k => ({ ...k, smoothedClose: k.close }));
    }
    
    const result = [];
    for (let i = 0; i < klines.length; i++) {
        let sum = 0;
        let count = 0;
        // 计算当前位置前 windowSize 个周期的平均值 (向后平滑)
        for (let j = Math.max(0, i - windowSize + 1); j <= i; j++) {
            sum += klines[j].close;
            count++;
        }
        result.push({
            ...klines[i],
            smoothedClose: sum / count
        });
    }
    return result;
}
