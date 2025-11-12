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

// 解析时间格式：202511070855 → 11月07日08:55
function parseKeyword(startTime) {
  // 1. 清理非数字字符
  let s = startTime.replace(/\D/g, '');
  
  // 2. 如果少于12位，前面补0
  while (s.length < 12) {
    s = '0' + s;
  }
  
  // 3. 如果多于12位，取最后12位
  if (s.length > 12) {
    s = s.substring(s.length - 12);
  }
  
  // 4. 再次确保是12位纯数字
  if (s.length !== 12 || !/^\d{12}$/.test(s)) {
    return '未知时间';
  }
  
  // 5. 直接切片，保留前导零
  const month = s.substring(4, 6);
  const day = s.substring(6, 8);
  const hour = s.substring(8, 10);
  const minute = s.substring(10, 12);
  
  return `${month}月${day}日${hour}:${minute}`;
}

// 从 HTML 页面抓取全运会比赛
async function fetchQuanyunhuiMatches() {
  const url1 = 'https://www.miguvideo.com/p/home/16ed73096e0244d1ba1034d973a020fe';
  const url2 = 'https://display-sc.miguvideo.com/display/v3/static/f63fc8c1ab724d01997e5664b178b9f7/7360879527bc4f07b40f00ef87e20c0a/b18e43e0f21d49aabd66f8c255c00f6f/fe0bd84f525746a0aa7c4506badf43ca';
  
  const allMatches = [];
  
  // 从第一个URL获取数据
  try {
    const matches1 = await fetchFromURL(url1);
    allMatches.push(...matches1);
    console.log(`从第一个URL成功抓取 ${matches1.length} 场全运会比赛`);
  } catch (error) {
    console.error('从第一个URL获取数据失败:', error.message);
  }
  
  // 从第二个URL获取数据
  try {
    const matches2 = await fetchFromURL(url2);
    allMatches.push(...matches2);
    console.log(`从第二个URL成功抓取 ${matches2.length} 场全运会比赛`);
  } catch (error) {
    console.error('从第二个URL获取数据失败:', error.message);
  }
  
  // 合并两个数据源的数据后统一去重
  const uniqueMatches = [];
  const seenMgdbIds = new Set();
  
  for (const match of allMatches) {
    if (!seenMgdbIds.has(match.mgdbId)) {
      seenMgdbIds.add(match.mgdbId);
      uniqueMatches.push(match);
    }
  }
  
  console.log(`合并去重后共有 ${uniqueMatches.length} 场全运会比赛`);
  return uniqueMatches;
  
  // 内部辅助函数：从单个URL获取数据
  async function fetchFromURL(url) {
    return new Promise((resolve, reject) => {
      const options = {
        headers: {
          'Connection': 'keep-alive',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
          'authority': new URL(url).hostname,
          'referer': 'https://www.miguvideo.com/p/schedule/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        }
      };
      
      const req = https.get(url, options, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`状态码错误: ${res.statusCode}`));
          return;
        }
        
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const htmlContent = data;
            
            // 正则匹配开头部分
            const pattern = /{"name":"([^"\\]*(?:\\.[^"\\]*)*)"\s*,\s*"pID":"([^"\\]*(?:\\.[^"\\]*)*)"\s*,\s*"title":"([^"\\]*(?:\\.[^"\\]*)*)"/g;
            const matches = [];
            let match;
            
            while ((match = pattern.exec(htmlContent)) !== null) {
              matches.push(match);
            }
            
            if (matches.length === 0) {
              reject(new Error('未找到任何 JSON 结构'));
              return;
            }
            
            const results = [];
            const today = getShanghaiDate(); // 使用与主数据相同的今天日期
            
            for (const match of matches) {
              const start = match.index;
              let count = 0;
              let end = -1;
              
              for (let i = start; i < htmlContent.length; i++) {
                if (htmlContent[i] === '{') {
                  count++;
                } else if (htmlContent[i] === '}') {
                  count--;
                  if (count === 0) {
                    end = i + 1;
                    break;
                  }
                }
              }
              
              if (end === -1) {
                continue;
              }
              
              const jsonStr = htmlContent.substring(start, end);
              
              try {
                const m = JSON.parse(jsonStr);
                const compName = m.competitionName;
                
                if (compName !== '全运会') {
                  continue;
                }
                
                const name = m.name || '';
                const title = m.title || '';
                const pID = m.pID || '';
                const startTimeRaw = m.startTime || '';
                
                const keytime = parseKeyword(startTimeRaw);
                
                // 解析比赛日期（从keytime中提取YYYYMMDD格式）
                const matchMonth = keytime.substring(0, 2);
                const matchDay = keytime.substring(3, 5);
                const matchYear = today.substring(0, 4); // 使用当前年份
                const matchDate = `${matchYear}${matchMonth}${matchDay}`;
                
                // 关键判断：只保留"今天"的比赛
                if (matchDate !== today) {
                  continue; // 不是今天的 → 直接跳过！
                }
                
                results.push({
                  mgdbId: pID,
                  keyword: keytime,
                  pkInfoTitle: title,
                  modifyTitle: name,
                  title: title,
                  competitionName: compName,
                  matchStatus: 1
                });
                
              } catch (parseError) {
                // 忽略JSON解析错误，继续处理下一个
                continue;
              }
            }
            
            resolve(results);
            
          } catch (error) {
            reject(new Error(`处理响应失败: ${error.message}`));
          }
        });
      });
      
      req.on('error', (error) => {
        reject(new Error(`请求失败: ${error.message}`));
      });
      
      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('请求超时'));
      });
    });
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
          keyword: match.keyword,
          sportItemId: match.sportItemId,
          matchStatus: match.matchStatus,
          matchField: match.matchField || "",
          competitionName: match.competitionName,
          padImg: match.padImg || "",
          competitionLogo: match.competitionLogo || "",
          pkInfoTitle: match.pkInfoTitle,
          modifyTitle: match.modifyTitle,
          presenters: match.presenters ? match.presenters.map(p => p.name).join(" ") : "",
          matchInfo: { time: match.keyword },
          nodes: nodes
        };
        
        result.push(mergedMatch);
        
        // 添加延迟以避免请求过于频繁
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } else {
      console.log(`今天 ${today} 没有比赛数据`);
    }
    
    // 获取今天的全运会比赛并添加到结果中
    try {
      console.log('开始获取今天全运会比赛数据...');
      const qyhMatches = await fetchQuanyunhuiMatches();
      
      // 🔥 关键修复：在全运会数据获取节点数据前去重
      const seenMgdbIds = new Set(); // 用于记录已处理的mgdbId
      const uniqueQyhMatches = [];   // 存储去重后的全运会比赛
      
      for (const qyhMatch of qyhMatches) {
        // 如果这个mgdbId已经处理过，跳过
        if (seenMgdbIds.has(qyhMatch.mgdbId)) {
          console.log(`跳过重复的全运会比赛: ${qyhMatch.mgdbId} - ${qyhMatch.title}`);
          continue;
        }
        
        seenMgdbIds.add(qyhMatch.mgdbId);
        uniqueQyhMatches.push(qyhMatch);
      }
      
      console.log(`全运会数据去重: ${qyhMatches.length} -> ${uniqueQyhMatches.length} 场比赛`);
      
      // 只处理去重后的比赛
      for (const qyhMatch of uniqueQyhMatches) {
        console.log(`获取全运会比赛 ${qyhMatch.mgdbId} 的节点数据...`);
        const nodes = await getMatchNodes(qyhMatch.mgdbId);
        
        const mergedMatch = {
          mgdbId: qyhMatch.mgdbId,
          pID: qyhMatch.mgdbId, // 使用mgdbId作为pID
          title: qyhMatch.title,
          keyword: qyhMatch.keyword,
          sportItemId: "", // 全运会数据中可能没有这个字段
          matchStatus: "", // 全运会数据中可能没有这个字段
          matchField: "",
          competitionName: qyhMatch.competitionName,
          padImg: "https://img.cmvideo.cn/publish/nryy-image/output/trans_img/2025/10/21/11005/d064ae13528b4396a6194f13163cb3d3/d064ae13528b4396a6194f13163cb3d3_H169_P1080_WEBP.webp", // 固定图片
          competitionLogo: "",
          pkInfoTitle: qyhMatch.pkInfoTitle,
          modifyTitle: qyhMatch.modifyTitle,
          presenters: "",
          matchInfo: { time: qyhMatch.keyword },
          nodes: nodes
        };
        
        result.push(mergedMatch);
        
        // 添加延迟以避免请求过于频繁
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      console.log(`成功添加 ${uniqueQyhMatches.length} 场全运会比赛`);
    } catch (error) {
      console.error('获取全运会比赛数据失败:', error.message);
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
