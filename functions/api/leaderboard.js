/**
 * Cloudflare Pages Function
 * Global leaderboard API using Cloudflare KV namespace STONK_LEADERBOARD
 */

export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const method = request.method;

    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json; charset=utf-8"
    };

    // 拦截 OPTIONS 预检请求
    if (method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: corsHeaders
        });
    }

    // 检查 KV 是否绑定
    const KV = env.STONK_LEADERBOARD;
    if (!KV) {
        return new Response(JSON.stringify({ 
            status: "local_mode", 
            message: "Cloudflare KV Namespace STONK_LEADERBOARD is not bound. Falling back to localStorage." 
        }), { status: 200, headers: corsHeaders });
    }

    // 1. 获取排行榜 (GET)
    if (method === "GET") {
        const code = url.searchParams.get("code") || "global";
        const period = url.searchParams.get("period") || "1Y";
        const smoothed = url.searchParams.get("smoothed") || "false";
        
        const kvKey = `leaderboard:${code}:${period}:${smoothed}`;

        try {
            const data = await KV.get(kvKey);
            const scores = data ? JSON.parse(data) : [];
            return new Response(JSON.stringify(scores), { status: 200, headers: corsHeaders });
        } catch (err) {
            return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
        }
    }

    // 2. 提交新成绩 (POST)
    if (method === "POST") {
        try {
            const body = await request.json();
            const { code, period, smoothed, name, score, time } = body;

            if (!code || !name || score === undefined || time === undefined) {
                return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400, headers: corsHeaders });
            }

            // 安全性过滤
            const sanitizedName = String(name).substring(0, 12).replace(/[^\u4e00-\u9fa5a-zA-Z0-9_\-\s]/g, "");
            if (!sanitizedName) {
                return new Response(JSON.stringify({ error: "Invalid nickname" }), { status: 400, headers: corsHeaders });
            }

            const kvKey = `leaderboard:${code}:${period}:${smoothed}`;
            const data = await KV.get(kvKey);
            let scores = data ? JSON.parse(data) : [];

            // 插入新记录
            const newRecord = {
                name: sanitizedName,
                score: Math.round(score),
                time: parseFloat(time.toFixed(1)),
                date: new Date().toISOString().split('T')[0]
            };
            scores.push(newRecord);

            // 排序逻辑：积分高者优先，积分相同则用时少者优先
            scores.sort((a, b) => {
                if (b.score !== a.score) {
                    return b.score - a.score;
                }
                return a.time - b.time;
            });

            // 仅保留前 10 名
            scores = scores.slice(0, 10);

            // 写入 KV
            await KV.put(kvKey, JSON.stringify(scores));

            return new Response(JSON.stringify({ success: true, leaderboard: scores }), { status: 200, headers: corsHeaders });
        } catch (err) {
            return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
        }
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: corsHeaders });
}
