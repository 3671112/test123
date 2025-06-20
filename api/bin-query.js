// api/bin-query.js
// Vercel Serverless Function for BIN查询
export default async function handler(req, res) {
    // 设置CORS头 - 允许跨域访问
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, api-key');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24小时缓存
    
    // 处理预检请求(OPTIONS)
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    
    // 只允许POST请求
    if (req.method !== 'POST') {
        res.status(405).json({ 
            error: 'Method not allowed', 
            message: '只支持POST请求' 
        });
        return;
    }
    
    try {
        // 从请求体获取参数
        const { bin, apiKey } = req.body;
        
        // 参数验证
        if (!bin) {
            res.status(400).json({ 
                error: 'Missing parameter',
                message: 'BIN号码是必需的' 
            });
            return;
        }
        
        if (!apiKey) {
            res.status(400).json({ 
                error: 'Missing API key',
                message: 'API密钥是必需的' 
            });
            return;
        }
        
        // 验证BIN格式
        const cleanBin = bin.toString().replace(/\D/g, '');
        if (cleanBin.length < 6 || cleanBin.length > 19) {
            res.status(400).json({ 
                error: 'Invalid BIN format',
                message: 'BIN号码必须是6-19位数字' 
            });
            return;
        }
        
        console.log(`[${new Date().toISOString()}] 查询BIN: ${cleanBin.substring(0, 6)}****`);
        
        // 定义多个备用API服务
        const apiServices = [
            {
                name: 'BinEagle Primary',
                url: 'http://bineagle.com/check_bin',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'api-key': apiKey,
                    'X-Requested-With': 'XMLHttpRequest',
                    'User-Agent': 'Mozilla/5.0 (compatible; BIN-Lookup/1.0)'
                },
                body: `bin=${cleanBin.substring(0, 6)}`
            },
            {
                name: 'BinEagle GET',
                url: `http://bineagle.com/check_bin?bin=${cleanBin.substring(0, 6)}`,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': apiKey,
                    'User-Agent': 'Mozilla/5.0 (compatible; BIN-Lookup/1.0)'
                }
            }
        ];
        
        // 尝试调用API服务
        let lastError = null;
        
        for (const service of apiServices) {
            try {
                console.log(`尝试调用 ${service.name}...`);
                
                const fetchOptions = {
                    method: service.method,
                    headers: service.headers,
                    timeout: 10000 // 10秒超时
                };
                
                if (service.body) {
                    fetchOptions.body = service.body;
                }
                
                // 创建带超时的fetch请求
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000);
                
                const response = await fetch(service.url, {
                    ...fetchOptions,
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                const data = await response.json();
                console.log(`${service.name} 返回:`, {
                    code: data.code,
                    hasData: !!data.data,
                    message: data.msg
                });
                
                // 处理BinEagle API响应
                if (data.code === "0000" && data.data) {
                    // 成功响应
                    const result = {
                        success: true,
                        data: {
                            bin: cleanBin.substring(0, 6),
                            cardType: data.data.cardType || data.data.cardProduct || '未知类型',
                            issuerName: data.data.issuerName || data.data.bankName || '未知银行',
                            country: data.data.countryName || data.data.country || '',
                            countryCode: data.data.countryCode || '',
                            website: data.data.website || '',
                            phone: data.data.phone || ''
                        },
                        source: service.name,
                        timestamp: new Date().toISOString()
                    };
                    
                    console.log(`✅ ${service.name} 查询成功`);
                    res.status(200).json(result);
                    return;
                    
                } else if (data.code === "0001") {
                    // API Key无效
                    res.status(401).json({
                        success: false,
                        error: 'Invalid API key',
                        message: 'API密钥无效或已过期',
                        code: data.code
                    });
                    return;
                    
                } else if (data.code === "0002") {
                    // BIN不存在
                    res.status(404).json({
                        success: false,
                        error: 'BIN not found',
                        message: '未找到该BIN号码的信息',
                        code: data.code
                    });
                    return;
                    
                } else {
                    // 其他错误
                    throw new Error(data.msg || '未知的API错误');
                }
                
            } catch (error) {
                console.log(`❌ ${service.name} 失败:`, error.message);
                lastError = error;
                
                // 如果是AbortError（超时），记录并继续下一个服务
                if (error.name === 'AbortError') {
                    console.log(`${service.name} 请求超时`);
                    continue;
                }
                
                // 其他错误也继续尝试下一个服务
                continue;
            }
        }
        
        // 所有服务都失败了
        console.error('所有API服务均失败');
        res.status(503).json({
            success: false,
            error: 'Service unavailable',
            message: '所有API服务当前不可用，请稍后重试',
            lastError: lastError?.message || '未知错误',
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('服务器内部错误:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: '服务器内部错误',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined,
            timestamp: new Date().toISOString()
        });
    }
}

// 辅助函数：创建带超时的fetch
function fetchWithTimeout(url, options, timeout = 8000) {
    return Promise.race([
        fetch(url, options),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Request timeout')), timeout)
        )
    ]);
}
