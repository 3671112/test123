// api/bin-query.js
// Vercel Serverless Function

export default async function handler(req, res) {
    // 设置CORS头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // 处理预检请求
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // 只允许POST请求
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    try {
        const { bin, apiKey } = req.body;

        // 验证参数
        if (!bin) {
            res.status(400).json({ error: 'BIN parameter is required' });
            return;
        }

        if (!apiKey) {
            res.status(400).json({ error: 'API Key is required' });
            return;
        }

        console.log('查询BIN:', bin);

        // 调用BinEagle API
        const apiUrl = `http://bineagle.com/check_bin?bin=${bin}`;
        
        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'api-key': apiKey,
                'User-Agent': 'Mozilla/5.0 (compatible; BIN-Lookup/1.0)'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP错误: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log('BinEagle API返回:', data);

        // 返回结果给前端
        res.status(200).json(data);

    } catch (error) {
        console.error('API调用失败:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            message: error.message 
        });
    }
}
