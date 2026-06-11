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

    // 1. 首先尝试请求 Cloudflare Serverless Function 代理 (如果在已部署的线上环境)
    try {
        const response = await fetch(`/api/stock?search=${encodeURIComponent(keyword)}`);
        if (response.ok) {
            return await response.json();
        }
    } catch (err) {
        console.warn(`[API] 联机代理搜索接口不可用: ${err.message}`);
    }

    // 2. 如果代理接口不可用 (例如本地 http.server 静态运行)，则尝试直接通过浏览器 JSONP 跨域请求新浪接口
    try {
        console.log(`[API] 正在尝试通过 JSONP 跨域请求新浪实时搜索接口...`);
        const results = await fetchSinaSuggestJSONP(keyword);
        if (results && results.length > 0) {
            return results;
        }
    } catch (err) {
        console.warn(`[API] JSONP 跨域搜索失败: ${err.message}`);
    }

    // 3. 终极兜底：使用本地预设的热门股票匹配
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

/**
 * 通过 JSONP 方式跨域请求新浪的股票搜索自动联想接口 (支持本地/无 Proxy 运行)
 * @param {string} keyword
 * @returns {Promise<Array>}
 */
function fetchSinaSuggestJSONP(keyword) {
    return new Promise((resolve, reject) => {
        const callbackName = `sina_suggest_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
        const script = document.createElement('script');
        
        // 新浪搜索建议接口支持通过 name 参数自定义全局变量名，借此实现跨域读取
        script.src = `https://suggest3.sinajs.cn/suggest/type=11,12,31&key=${encodeURIComponent(keyword)}&name=${callbackName}`;
        script.async = true;
        
        const timeout = setTimeout(() => {
            cleanup();
            reject(new Error("Sina suggest JSONP request timeout"));
        }, 4000);
        
        function cleanup() {
            clearTimeout(timeout);
            script.remove();
            try {
                delete window[callbackName];
            } catch (e) {}
        }
        
        script.onload = () => {
            const dataStr = window[callbackName];
            cleanup();
            if (typeof dataStr !== 'string') {
                reject(new Error("Invalid JSONP response"));
                return;
            }
            try {
                const results = parseSinaSuggestText(dataStr);
                resolve(results);
            } catch (e) {
                reject(e);
            }
        };
        
        script.onerror = (err) => {
            cleanup();
            reject(new Error("JSONP script load error"));
        };
        
        document.body.appendChild(script);
    });
}

/**
 * 解析新浪 suggest3 接口返回的原始文本格式为对象数组
 * 格式: "平安银行,11,000001,sz000001,平安银行,payh;..."
 */
function parseSinaSuggestText(text) {
    if (!text) return [];
    const rawRecords = text.split(';');
    return rawRecords.map(rec => {
        const parts = rec.split(',');
        if (parts.length < 6) return null;
        
        const name = parts[0];
        const codeNum = parts[2];
        const marketCode = parts[3]; // sh600519 or sz300750
        
        let resolvedSecid = "";
        if (marketCode.startsWith("sh")) {
            resolvedSecid = `1.${codeNum}`;
        } else if (marketCode.startsWith("sz") || marketCode.startsWith("bj")) {
            resolvedSecid = `0.${codeNum}`;
        } else {
            return null; // 过滤非 A 股其他市场
        }

        return {
            name: name,
            code: codeNum,
            secid: resolvedSecid,
            market: marketCode.startsWith("sh") ? 1 : 0
        };
    }).filter(item => item !== null);
}
