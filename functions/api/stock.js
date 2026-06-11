/**
 * Cloudflare Pages Function
 * Proxy to fetch A-share stock data and autocomplete search from Eastmoney / Sina Finance
 */

export async function onRequestGet(context) {
    const { request } = context;
    const url = new URL(request.url);
    
    const code = url.searchParams.get("code");
    const limit = url.searchParams.get("limit") || "240";
    const search = url.searchParams.get("search");
    const secid = url.searchParams.get("secid"); // 允许前端直接传递完整的 secid (如 1.000001)

    // 设置 CORS 头，方便本地调试或跨域使用
    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json; charset=utf-8"
    };

    // 1. 处理搜索建议请求
    if (search) {
        try {
            const searchUrl = `http://suggest3.sinajs.cn/suggest/type=11,12,31&key=${encodeURIComponent(search)}&name=suggestdata`;
            
            const response = await fetch(searchUrl, {
                headers: {
                    "Referer": "http://finance.sina.com.cn",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                }
            });

            if (!response.ok) {
                return new Response(JSON.stringify({ error: "Sina API suggest error" }), { status: 500, headers: corsHeaders });
            }

            const buffer = await response.arrayBuffer();
            const decoder = new TextDecoder("gbk");
            const text = decoder.decode(buffer);
            // 解析新浪的 JavaScript 变量返回格式: var suggestdata="贵州茅台,11,600519,sh600519,贵州茅台,gizm;..."
            const match = text.match(/"([^"]+)"/);
            if (!match || !match[1]) {
                return new Response(JSON.stringify([]), { status: 200, headers: corsHeaders });
            }

            const rawRecords = match[1].split(';');
            const results = rawRecords.map(rec => {
                const parts = rec.split(',');
                if (parts.length < 6) return null;
                
                const name = parts[0];
                const type = parts[1]; // 11=A股, 12=B股, 31=基金
                const codeNum = parts[2];
                const marketCode = parts[3]; // sh600519 or sz300750
                
                // 转换市场代码为东财的 secid 格式
                let resolvedSecid = "";
                if (marketCode.startsWith("sh")) {
                    resolvedSecid = `1.${codeNum}`;
                } else if (marketCode.startsWith("sz")) {
                    resolvedSecid = `0.${codeNum}`;
                } else {
                    return null; // 其他市场暂不支持
                }

                return {
                    name: name,
                    code: codeNum,
                    secid: resolvedSecid,
                    market: marketCode.startsWith("sh") ? 1 : 0
                };
            }).filter(item => item !== null);

            return new Response(JSON.stringify(results), { status: 200, headers: corsHeaders });
        } catch (err) {
            return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
        }
    }

    // 2. 处理 K 线获取请求
    if (code || secid) {
        let finalSecid = secid;

        if (!finalSecid && code) {
            // 如果前端只传了 code，根据 A 股代码规则估算 secid
            // 6xxxxxx/688xxx/9xxxxxx/5xxxxxx 或者是上证大盘/沪深指数等为沪市 (1.)
            // 其他 (如 000xxx, 002xxx, 300xxx) 为深市 (0.)
            // 注：000001 如果是股票是深市(平安银行)，如果是指数是沪市(上证指数)，这里纯code输入默认偏向平安银行
            if (code.startsWith("6") || code.startsWith("9") || code.startsWith("5") || code === "000300") {
                finalSecid = `1.${code}`;
            } else {
                finalSecid = `0.${code}`;
            }
        }

        try {
            // 构造东财 K 线 API
            // klt=101 (日K线), fqt=1 (前复权)
            // fields2 表示要返回的K线指标字段：f51(日期),f52(开盘),f53(收盘),f54(最高),f55(最低),f56(成交量),f57(成交额),f58(振幅),f59(涨跌幅),f60(涨跌额),f61(换手率)
            const klineUrl = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${finalSecid}&klt=101&fqt=1&lmt=${limit}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61`;

            const response = await fetch(klineUrl, {
                headers: {
                    "Referer": "https://quote.eastmoney.com/",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                }
            });

            if (!response.ok) {
                return new Response(JSON.stringify({ error: "Eastmoney API error" }), { status: 500, headers: corsHeaders });
            }

            const data = await response.json();
            return new Response(JSON.stringify(data), { status: 200, headers: corsHeaders });
        } catch (err) {
            return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
        }
    }

    return new Response(JSON.stringify({ error: "Missing parameters 'code', 'secid', or 'search'" }), { status: 400, headers: corsHeaders });
}

// 拦截 OPTIONS 预检请求
export async function onRequestOptions() {
    return new Response(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type"
        }
    });
}
