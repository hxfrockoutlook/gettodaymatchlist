const fs = require('fs');
const https = require('https');

// 获取上海时间
function getShanghaiTime() {
  const now = new Date();
  // 上海时间 = UTC +8
  const shanghaiTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return shanghaiTime.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
}

// 获取上海日期（YYYYMMDD格式）
function getShanghaiDate() {
  const now = new Date();
  const shanghaiTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const year = shanghaiTime.getUTCFullYear();
  const month = String(shanghaiTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shanghaiTime.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

// 统一格式化中文日期字符串
// 处理多种格式：将"1月03日15:00"、"1月03日 15:00"等转换为"01月03日15:00"
function formatChineseDateTime(dateTimeStr) {
  try {
    if (!dateTimeStr || typeof dateTimeStr !== 'string') {
      return dateTimeStr;
    }
    
    // 调试日志，可以注释掉
    // console.log(`原始日期字符串: "${dateTimeStr}"`);
    
    // 匹配多种格式：
    // 1. "1月03日15:00"   - 无空格
    // 2. "1月03日 15:00"  - 中间有空格
    // 3. "01月03日15:00"  - 已经是正确格式
    // 4. "01月03日 15:00" - 正确月份但有空格
    
    // 使用更宽松的正则表达式匹配
    const match = dateTimeStr.match(/(\d{1,2})月(\d{1,2})日\s*(\d{1,2}):(\d{2})/);
    
    if (!match) {
      console.warn(`无法解析日期格式: "${dateTimeStr}"`);
      return dateTimeStr; // 返回原始字符串
    }
    
    let month = match[1];
    let day = match[2];
    let hour = match[3];
    let minute = match[4];
    
    // 补全前导零
    month = month.padStart(2, '0');
    day = day.padStart(2, '0');
    
    // 小时部分也补全前导零（可选，根据需求）
    // 如果你希望小时也保持两位数（如03:45而不是3:45），取消下面这行的注释
    // hour = hour.padStart(2, '0');
    
    const result = `${month}月${day}日${hour}:${minute}`;
    // console.log(`格式化结果: "${result}"`);
    
    return result;
  } catch (error) {
    console.error(`格式化中文日期时间错误: ${dateTimeStr}`, error);
    return dateTimeStr;
  }
}

async function fetchWithRetry(url, options, maxRetries = 2) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await new Promise((resolve, reject) => {
        const req = https.get(url, options, (res) => {
          let data = '';
          
          res.on('data', (chunk) => {
            data += chunk;
          });
          
          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve({ status: res.statusCode, data });
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
            }
          });
        });
        
        req.on('error', reject);
        req.setTimeout(10000, () => {
          req.destroy();
          reject(new Error('Request timeout'));
        });
      });
    } catch (error) {
      console.warn(`请求失败 (尝试 ${attempt}/${maxRetries}):`, error.message);
      if (attempt === maxRetries) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

async function getMatchNodes(mgdbId) {
  const seenNodes = new Set();
  const nodes = [];
  
  try {
    const response = await fetchWithRetry(`https://vms-sc.miguvideo.com/vms-match/v6/staticcache/basic/basic-data/${mgdbId}/miguvideo`, {
      headers: {
        'appVersion': '2600052000',
        'User-Agent': 'Dalvik%2F2.1.0+%28Linux%3B+U%3B+Android+9%3B+TAS-AN00+Build%2FPQ3A.190705.08211809%29',
        'terminalId': 'android',
        'appCode': 'miguvideo_default_android',
        'appType': '3',
        'appId': 'miguvideo',
        'Content-Type': 'application/json'
      }
    });
    
    const jsonData = JSON.parse(response.data);
    
    if (jsonData.code === 200 && jsonData.body && jsonData.body.multiPlayList) {
      
      // 按照新的顺序处理节点数据：replayList → liveList → preList
      const processNodeList = (nodeList) => {
        if (nodeList) {
          for (const item of nodeList) {
            const nodeKey = `${item.pID}|${item.name}`;
            if (!seenNodes.has(nodeKey)) {
              seenNodes.add(nodeKey);
              nodes.push({
                pID: item.pID,
                name: item.name
              });
            }
          }
        }
      };
      
      // 保持新的处理顺序：replayList → liveList → preList
      processNodeList(jsonData.body.multiPlayList.replayList);
      processNodeList(jsonData.body.multiPlayList.liveList);
      processNodeList(jsonData.body.multiPlayList.preList);
    }
  } catch (error) {
    console.error(`获取节点数据失败 (mgdbId: ${mgdbId}):`, error.message);
  }
  
  return nodes;
}

async function fetchAndProcessData() {
  try {
    console.log('开始获取赛事数据...');
    
    // 获取主JSON数据
    const jsonResponse = await fetchWithRetry('https://vms-sc.miguvideo.com/vms-match/v6/staticcache/basic/match-list/normal-match-list/0/all/default/1/miguvideo');
    const jsonData = JSON.parse(jsonResponse.data);
    
    console.log('主数据获取成功，开始处理比赛数据...');
    
    const result = [];
    const today = getShanghaiDate(); // 获取今天的日期
    
    const matchList = jsonData.body.matchList;
    
    // 只处理今天的数据
    if (matchList[today]) {
      const matches = matchList[today];
      console.log(`处理今天 ${today} 的比赛，共 ${matches.length} 场`);
      
      for (const match of matches) {
        // 获取节点数据
        console.log(`获取比赛 ${match.mgdbId} 的节点数据...`);
        const nodes = await getMatchNodes(match.mgdbId);
        
        const mergedMatch = {
          mgdbId: match.mgdbId,
          pID: match.pID,
          title: match.title,
          keyword: formatChineseDateTime(match.keyword),  // 使用格式化函数
          sportItemId: match.sportItemId,
          matchStatus: match.matchStatus,
          matchField: match.matchField || "",
          competitionName: match.competitionName,
          padImg: match.padImg || "",
          competitionLogo: match.competitionLogo || "",
          pkInfoTitle: match.pkInfoTitle,
          modifyTitle: match.modifyTitle,
          presenters: match.presenters ? match.presenters.map(p => p.name).join(" ") : "",
          matchInfo: { time: formatChineseDateTime(match.keyword) },
          nodes: nodes
        };
        
        result.push(mergedMatch);
        
        // 添加延迟以避免请求过于频繁
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } else {
      console.log(`今天 ${today} 没有比赛数据`);
    }
    
    // 生成最终数据（格式完全保持不变）
    const finalData = {
      success: true,
      updateTime: getShanghaiTime(),
      data: result
    };
    
    return finalData;
    
  } catch (error) {
    console.error('处理数据时发生错误:', error);
    return {
      success: false,
      error: error.message,
      updateTime: getShanghaiTime(),
      data: []
    };
  }
}

// 主执行函数
async function main() {
  try {
    console.log('🚀 开始执行数据获取任务...');
    
    const data = await fetchAndProcessData();
    
    // 检查数据是否有效
    if (!data.success || !data.data || Object.keys(data.data).length === 0) {
      console.log('❌ 数据获取失败或今天没有比赛数据，不更新文件');
      return;
    }
    
    // 先保存到临时文件
    const tempFilename = 'sports-data-temp.json';
    fs.writeFileSync(tempFilename, JSON.stringify(data, null, 2));
    
    // 验证临时文件是否有效
    try {
      const tempData = JSON.parse(fs.readFileSync(tempFilename, 'utf8'));
      if (tempData.success && tempData.data && Object.keys(tempData.data).length > 0) {
        // 临时文件有效，替换原文件
        fs.renameSync(tempFilename, 'sports-data-today.json');
        console.log('✅ 今日数据已保存到: sports-data-today.json');
        console.log(`📊 今天共有 ${data.data.length} 场比赛`);
      } else {
        console.log('❌ 临时文件数据无效，不更新原文件');
        fs.unlinkSync(tempFilename); // 删除临时文件
      }
    } catch (error) {
      console.log('❌ 临时文件验证失败，不更新原文件');
      if (fs.existsSync(tempFilename)) {
        fs.unlinkSync(tempFilename); // 删除临时文件
      }
    }
    
  } catch (error) {
    console.error('❌ 执行失败:', error);
  }
}

// 如果直接运行此文件
if (require.main === module) {
  main();
}

module.exports = { fetchAndProcessData, getMatchNodes };
