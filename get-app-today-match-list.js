const fs = require('fs');
const https = require('https');
const http = require('http'); 

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
    
    // 去除字符串两端的空白字符
    const trimmedStr = dateTimeStr.trim();
    
    // 匹配模式：数字(1-2位)月数字(1-2位)日 空格(0或多个) 数字(1-2位):数字(2位)
    const match = trimmedStr.match(/^(\d{1,2})月(\d{1,2})日\s*(\d{1,2}):(\d{2})$/);
    
    if (!match) {
      return trimmedStr; // 返回原始字符串
    }
    
    // 提取匹配的组
    let month = match[1];  // 月
    let day = match[2];    // 日
    let hour = match[3];   // 时
    let minute = match[4]; // 分
    
    // 补全前导零（确保月份和日期都是两位数）
    month = month.padStart(2, '0');
    day = day.padStart(2, '0');
    
    // 构建格式化后的字符串
    return `${month}月${day}日${hour}:${minute}`;
  } catch (error) {
    console.error(`格式化中文日期时间错误: ${dateTimeStr}`, error);
    return dateTimeStr;
  }
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
  const url2 = 'https://display-sc.miguvideo.com/display/v3/static/9d252e2d70064d0584a79e990f51e064/432897b2b9e647488ce6baf0565bbdf2/e1645cd6b84940f2b89d759550afc591/0abe98d9b2124becb6bdff002b22aa4b';
  
  const allMatches = [];
  
  // 从第一个URL获取数据
  try {
    const matches1 = await fetchFromURL(url1);
    allMatches.push(...matches1);
    console.log(`从第一个URL成功抓取 ${matches1.length} 场比赛`);
  } catch (error) {
    console.error('从第一个URL获取数据失败:', error.message);
  }
  
  // 从第二个URL获取数据
  try {
    const matches2 = await fetchFromURL(url2);
    allMatches.push(...matches2);
    console.log(`从第二个URL成功抓取 ${matches2.length} 场比赛`);
  } catch (error) {
    console.error('从第二个URL获取数据失败:', error.message);
  }
  
  return allMatches;
}
  
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
              
              // 修改：检测 dataType 而不是 competitionName
              if (m.dataType !== 3) {
                continue;
              }
              
              const name = m.name || '';
              const title = m.title || '';
              const pID = m.pID || '';
              const startTimeRaw = m.startTime || '';
              const endTimeRaw = m.endTime || '';
              const competitionName = m.competitionName || '';
              
              // 获取图片 - 优先使用 pics.highResolutionH，其次使用 logo
              let padImg = '';
              if (m.pics && m.pics.highResolutionH) {
                padImg = m.pics.highResolutionH;
              } else if (m.logo) {
                padImg = m.logo;
              }
              
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
              
              // 获取开始时间和结束时间的HH:MM格式
              const startTimeHHMM = startTimeRaw.substring(8, 10) + ':' + startTimeRaw.substring(10, 12); // 提取HH:MM
              const endTimeHHMM = endTimeRaw.substring(8, 10) + ':' + endTimeRaw.substring(10, 12); // 提取HH:MM
              
              // 获取当前时间的HH:MM格式（上海时间）
              const shanghaiTime = getShanghaiTime(); // 使用已有的上海时间函数
              const currentHHMM = shanghaiTime.substring(11, 16); // 提取HH:MM部分

              // 获取当前时间的HH:MM格式（上海时间）
              /*
              const now = new Date();
              const shanghaiTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
              const currentHHMM = shanghaiTime.getUTCHours().toString().padStart(2, '0') + ':' + 
                                 shanghaiTime.getUTCMinutes().toString().padStart(2, '0'); */
              
              // 判断比赛状态
              let matchStatus;
              if (currentHHMM < startTimeHHMM) {
                matchStatus = '0'; // 未开始
              } else if (currentHHMM > endTimeHHMM) {
                matchStatus = '2'; // 已结束
              } else {
                matchStatus = '1'; // 进行中
              }
              
              results.push({
                mgdbId: pID,
                keyword: keytime,
                pkInfoTitle: title,
                modifyTitle: name,
                title: title,
                competitionName: competitionName,
                matchStatus: matchStatus,
                padImg: padImg // 添加图片字段
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

// 修改后的 fetchWithRetry：支持 HTTP 和 HTTPS
async function fetchWithRetry(url, options, maxRetries = 2) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await new Promise((resolve, reject) => {
        let client;
        try {
          const urlObj = new URL(url);
          client = urlObj.protocol === 'https:' ? https : http;
        } catch (e) {
          reject(new Error('Invalid URL'));
          return;
        }
        
        const req = client.get(url, options, (res) => {
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

/**
 * 从 M3U 地址获取数据，聚合体育相关条目（昨天、今天、明天）
 * 返回 Map，键为去除空格后的 tvg-id，值为聚合对象，包含 times 数组
 */
async function fetchM3UAndAggregate() {
  const aggregateMap = new Map();
  try {
    console.log('开始获取 M3U 数据...');
    const response = await fetchWithRetry('http://ikuai.168957.xyz:9080/migu_www.php?VideoDetail=https://42.121.106.99/266020607/nlpsD98B7B683DA0CFDCE1B4/');
    const m3uContent = response.data;
    const lines = m3uContent.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line.startsWith('#EXTINF:')) continue;
      
      // 解析 EXTINF 行属性
      const tvgIdMatch = line.match(/tvg-id="([^"]*)"/);
      const tvgNameMatch = line.match(/tvg-name="([^"]*)"/);
      const groupTitleMatch = line.match(/group-title="([^"]*)"/);
      
      if (!tvgIdMatch || !tvgNameMatch || !groupTitleMatch) continue;
      
      const tvgId = tvgIdMatch[1];
      const tvgName = tvgNameMatch[1];
      const groupTitle = groupTitleMatch[1];
      
      // 只保留体育-昨天、今天、明天
      if (!groupTitle.startsWith('体育-')) continue;
      const suffix = groupTitle.substring(3);
      if (!['昨天', '今天', '明天'].includes(suffix)) continue;
      
      // 获取下一行的 URL
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === '') j++;
      if (j >= lines.length) break;
      const url = lines[j].trim();
      i = j; // 下次循环从 URL 之后开始
      
      // 提取 competitionName（第一个空格前的内容）
      const firstSpaceIdx = tvgName.indexOf(' ');
      if (firstSpaceIdx === -1) continue; // 格式异常，跳过
      const competitionName = tvgName.substring(0, firstSpaceIdx);
      
      // 提取 time（最后一个空格后的 HH:MM）
      const lastSpaceIdx = tvgName.lastIndexOf(' ');
      if (lastSpaceIdx === -1) continue;
      const possibleTime = tvgName.substring(lastSpaceIdx + 1).trim();
      if (!/^\d{2}:\d{2}$/.test(possibleTime)) continue; // 不是时间格式，跳过
      const time = possibleTime;
      
      // 提取中间部分（去掉 competitionName 和 time）
      let middlePart = tvgName.substring(firstSpaceIdx + 1, lastSpaceIdx).trim();
      
      // 从中间部分移除 tvg-id 得到 name
      // 转义 tvgId 中的正则特殊字符
      const escapedTvgId = tvgId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const name = middlePart.replace(new RegExp(escapedTvgId, 'g'), '').trim();
      
      // 用于匹配的键：去除所有空格的 tvg-id
      const normalizedTvgId = tvgId.replace(/\s+/g, '');
      
      if (!aggregateMap.has(normalizedTvgId)) {
        // 首次遇到该 tvg-id，初始化 times 数组和 nodes 数组
        aggregateMap.set(normalizedTvgId, {
          tvgId: tvgId,
          normalizedTvgId: normalizedTvgId,
          competitionName: competitionName,
          times: [time],          // 改为数组，存储所有时间
          nodes: [{ name, url }]
        });
      } else {
        // 已存在，追加时间（可能重复，但匹配时会遍历）
        const entry = aggregateMap.get(normalizedTvgId);
        entry.times.push(time);
        entry.nodes.push({ name, url });
      }
    }
    console.log(`M3U 数据聚合完成，共 ${aggregateMap.size} 个唯一 tvg-id`);
  } catch (error) {
    console.warn('获取或解析 M3U 数据失败:', error.message);
  }
  return aggregateMap;
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

/**
 * 标准化队伍字符串：忽略顺序，支持 VS 分隔（不区分大小写）
 * 例如 "热火VS76人" 和 "76人VS热火" 均返回 "76人热火"
 */
function normalizeTeamString(str) {
  if (!str) return '';
  const trimmed = str.replace(/\s+/g, ''); // 先去除所有空格
  // 匹配 VS（不区分大小写），捕获 VS 前后的内容
  const vsMatch = trimmed.match(/^(.*?)(vs)(.*)$/i);
  if (vsMatch) {
    const team1 = vsMatch[1];
    const team2 = vsMatch[3];
    // 对两个队伍名称排序，然后拼接
    const parts = [team1, team2].sort();
    return parts.join('').toLowerCase();
  }
  return trimmed.toLowerCase();
}

// 计算两个 HH:MM 时间在 24 小时内的最小分钟差
function timeDiffInMinutes(t1, t2) {
  const [h1, m1] = t1.split(':').map(Number);
  const [h2, m2] = t2.split(':').map(Number);
  const mins1 = h1 * 60 + m1;
  const mins2 = h2 * 60 + m2;
  const diff = Math.abs(mins1 - mins2);
  return Math.min(diff, 24 * 60 - diff);
}

async function fetchAndProcessData() {
  try {
    console.log('开始获取赛事数据...');

    // 获取并聚合 M3U 体育数据
    const m3uAggregateMap = await fetchM3UAndAggregate();
    
    // 第一步：获取三个数据源的数据
    const allMatches = [];
    const today = getShanghaiDate();
    
    // 1. 获取主JSON数据
    try {
      console.log('获取主JSON数据...');
      const jsonResponse = await fetchWithRetry('https://vms-sc.miguvideo.com/vms-match/v6/staticcache/basic/match-list/normal-match-list/0/all/default/1/miguvideo');
      const jsonData = JSON.parse(jsonResponse.data);
      
      const matchList = jsonData.body.matchList;
      if (matchList[today]) {
        const matches = matchList[today];
        console.log(`主JSON数据: 今天 ${today} 有 ${matches.length} 场比赛`);
        
        for (const match of matches) {
          allMatches.push({
            source: 'main',
            mgdbId: match.mgdbId,
            pID: match.pID,
            title: match.title,
            keyword: formatChineseDateTime(match.keyword),
            sportItemId: match.sportItemId,
            matchStatus: match.matchStatus,
            matchField: match.matchField || "",
            competitionName: match.competitionName,
            padImg: match.padImg || "",
            competitionLogo: match.competitionLogo || "",
            pkInfoTitle: match.pkInfoTitle,
            modifyTitle: match.modifyTitle,
            presenters: match.presenters ? match.presenters.map(p => p.name).join(" ") : ""
          });
        }
      }
    } catch (error) {
      console.error('获取主JSON数据失败:', error.message);
    }
    
    // 2. 获取两个URL的全运会数据
    try {
      console.log('获取全运会数据...');
      const qyhMatches = await fetchQuanyunhuiMatches();
      console.log(`全运会数据: 获取到 ${qyhMatches.length} 场比赛`);
      
      for (const match of qyhMatches) {
        allMatches.push({
          source: 'quanyunhui',
          mgdbId: match.mgdbId,
          pID: match.mgdbId, // 使用mgdbId作为pID
          title: match.title,
          keyword: match.keyword,
          sportItemId: "", // 全运会数据中可能没有这个字段
          matchStatus: match.matchStatus,
          matchField: "",
          competitionName: match.competitionName,
          padImg: match.padImg || "", // 使用从HTML中提取的图片
          competitionLogo: "",
          pkInfoTitle: match.pkInfoTitle,
          modifyTitle: match.modifyTitle,
          presenters: ""
        });
      }
    } catch (error) {
      console.error('获取全运会数据失败:', error.message);
    }
    
    console.log(`三个数据源合并后共有 ${allMatches.length} 场比赛`);
    
    // 第二步：根据mgdbId去重
    const uniqueMatches = [];
    const seenMgdbIds = new Set();
    
    for (const match of allMatches) {
      if (!seenMgdbIds.has(match.mgdbId)) {
        seenMgdbIds.add(match.mgdbId);
        uniqueMatches.push(match);
      } else {
        console.log(`跳过重复比赛: ${match.mgdbId} - ${match.title}`);
      }
    }
    
    console.log(`去重后共有 ${uniqueMatches.length} 场比赛`);
    
    // 第三步：为所有比赛获取节点数据
    const result = [];
    
    for (const match of uniqueMatches) {
      console.log(`获取比赛 ${match.mgdbId} 的节点数据...`);
      const nodes = await getMatchNodes(match.mgdbId);
      
      const mergedMatch = {
        mgdbId: match.mgdbId,
        pID: match.pID,
        title: match.title,
        keyword: formatChineseDateTime(match.keyword),
        sportItemId: match.sportItemId,
        matchStatus: match.matchStatus,
        matchField: match.matchField,
        competitionName: match.competitionName,
        padImg: match.padImg,
        competitionLogo: match.competitionLogo,
        pkInfoTitle: match.pkInfoTitle,
        modifyTitle: match.modifyTitle,
        presenters: match.presenters,
        matchInfo: { time: formatChineseDateTime(match.keyword) },
        nodes: nodes
      };

        // 匹配 M3U 数据并合并节点======================
        // 匹配 M3U 数据并合并节点（改进：tvg-id 去空格忽略大小写、时间允许多值匹配、支持跨午夜）
        const normalizedPkInfoTitle = normalizeTeamString(match.pkInfoTitle);
        const matchCompetitionName = (match.competitionName || '').toLowerCase();
        const matchTimeStr = match.keyword ? match.keyword.slice(-5) : ''; // 取最后5位 HH:MM
        
        // 遍历聚合 Map 寻找匹配项
        for (const [normId, aggItem] of m3uAggregateMap.entries()) {
          // 比较 tvg-id（标准化处理，支持顺序无关）
          if (normalizeTeamString(normId) !== normalizedPkInfoTitle) continue;
          
          // 比较 competitionName（忽略大小写）
          if (aggItem.competitionName.toLowerCase() !== matchCompetitionName) continue;
          
          // 比较时间：检查 aggItem.times 中是否存在与 matchTimeStr 相差 ≤30 分钟的时间（考虑跨午夜）
          let timeMatched = false;
          for (const t of aggItem.times) {
            if (timeDiffInMinutes(t, matchTimeStr) <= 30) {
              timeMatched = true;
              break;
            }
          }
          if (!timeMatched) continue;
          
          // 三项匹配成功，追加节点
          mergedMatch.nodes.push(...aggItem.nodes.map(node => ({ url: node.url, name: node.name })));
          console.log(`比赛 ${match.mgdbId} 匹配到 M3U 数据，追加 ${aggItem.nodes.length} 个节点`);
          break; // 一个比赛只匹配一个 tvg-id
        }
        // =============================================
      
      result.push(mergedMatch);
      
      // 添加延迟以避免请求过于频繁
      await new Promise(resolve => setTimeout(resolve, 500));
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
