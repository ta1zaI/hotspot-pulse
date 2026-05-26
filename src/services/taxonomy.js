const PLATFORM_REGISTRY = {
  weibo: platform('weibo', '微博', 'domestic', '国内', 'CN', 'social-trend', '热搜平台'),
  x: platform('x', 'X', 'overseas', '海外', 'US', 'social-trend', '热搜平台'),
  reddit: platform('reddit', 'Reddit', 'overseas', '海外', 'US', 'community', '社区趋势'),
  tiktok: platform('tiktok', 'TikTok', 'overseas', '海外', 'US', 'short-video', '短视频趋势'),
  gamersky: platform('gamersky', '游民星空', 'domestic', '国内', 'CN', 'gaming-news', '游戏媒体'),
  threedm: platform('threedm', '3DM游戏网', 'domestic', '国内', 'CN', 'gaming-news', '游戏媒体'),
  yystv: platform('yystv', '游研社', 'domestic', '国内', 'CN', 'gaming-news', '游戏媒体'),
  gcores: platform('gcores', '机核网', 'domestic', '国内', 'CN', 'gaming-news', '游戏媒体'),
  gameres: platform('gameres', 'GameRes', 'domestic', '国内', 'CN', 'gaming-industry', '游戏产业'),
  nadianshi: platform('nadianshi', '手游那点事', 'domestic', '国内', 'CN', 'gaming-industry', '游戏产业'),
  gamelook: platform('gamelook', 'GameLook', 'domestic', '国内', 'CN', 'gaming-industry', '游戏产业'),
  aihot: platform('aihot', 'AI HOT', 'domestic', '国内', 'CN', 'ai-news', 'AI 动态'),
  bilibili_daily: platform('bilibili_daily', 'B站日榜', 'domestic', '国内', 'CN', 'video', '视频榜单'),
  bilibili_weekly: platform('bilibili_weekly', 'B站周榜', 'domestic', '国内', 'CN', 'video', '视频榜单'),
  douban_nowplaying: platform('douban_nowplaying', '豆瓣影院热映', 'domestic', '国内', 'CN', 'film-tv', '影视榜单'),
  douban_movie: platform('douban_movie', '豆瓣热门电影', 'domestic', '国内', 'CN', 'film-tv', '影视榜单'),
  douban_tv: platform('douban_tv', '豆瓣热门剧集', 'domestic', '国内', 'CN', 'film-tv', '影视榜单')
};

const CATEGORY_REGISTRY = {
  politics: { label: '政务国际', order: 10 },
  tech: { label: '科技数码', order: 20 },
  finance: { label: '财经商业', order: 30 },
  entertainment: { label: '影视娱乐', order: 40 },
  sports: { label: '体育赛事', order: 50 },
  society: { label: '社会民生', order: 60 },
  education: { label: '教育考试', order: 70 },
  health: { label: '健康医疗', order: 80 },
  gaming: { label: '游戏电竞', order: 90 },
  auto: { label: '汽车出行', order: 100 },
  travel: { label: '旅行文旅', order: 110 },
  food: { label: '餐饮美食', order: 120 },
  lifestyle: { label: '生活消费', order: 130 },
  science: { label: '科学探索', order: 140 },
  meme: { label: '时下热梗', order: 150 },
  general: { label: '综合热点', order: 999 }
};

const CATEGORY_RULES = [
  {
    id: 'gaming',
    patterns: [
      /游戏|电竞|手游|端游|页游|网游|主机|掌机|单机|独立游戏|休闲游戏|二游|买量|版号|流水|公测|内测|测试服|停服|开服|开测|上线|下架|发行|研发|运营|渠道|出海|厂商|制作人|制作组|工作室|发行商|开发商|玩家|关卡|副本|角色|皮肤|卡池|抽卡|赛季|DLC|MOD|Steam|任天堂|索尼|xbox|PS5|Switch|GTA|宝可梦|塞尔达|宫崎英高|原神|鸣潮|明日方舟|王者荣耀|和平精英|英雄联盟|LOL|DOTA|PUBG|Apex|Valorant|CS2|Minecraft|Fortnite|game|gaming|gamer|games|esports|e-sports|indie|steam|nintendo|playstation|xbox|roblox|unity|unreal/i
    ]
  },
  {
    id: 'politics',
    patterns: [/主席|总统|外交|中美|白宫|国会|政府|国务院|选举|政策|制裁|峰会|联合国|战争|停火|台湾|世卫|minister|president|election|congress|white house|sanction|summit/i]
  },
  {
    id: 'tech',
    patterns: [/AI|人工智能|大模型|模型|机器人|芯片|半导体|手机|苹果|华为|小米|应用|软件|算法|算力|数据中心|微信|DeepSeek|OpenAI|Google|Microsoft|Tesla|Nvidia|iPhone|Android|app|security|cyber/i]
  },
  {
    id: 'finance',
    patterns: [/股票|股市|基金|金价|油价|房贷|楼市|消费|财报|公司|品牌|发布会|市场|降息|汇率|关税|A股|租金|crypto|bitcoin|stock|market|earnings|tariff|inflation|rate/i]
  },
  {
    id: 'entertainment',
    patterns: [/电影|电视剧|剧集|综艺|明星|艺人|演员|导演|票房|演唱会|音乐|专辑|舞台|路透|主演|开播|优酷|腾讯视频|爱奇艺|Netflix|movie|film|trailer|music|song|actor|celebrity/i]
  },
  {
    id: 'sports',
    patterns: [/国乒|世界杯|世乒赛|比赛|夺冠|冠军|球员|篮球|足球|网球|奥运|中超|英超|NBA|FIFA|league|cup|worldcup/i]
  },
  {
    id: 'society',
    patterns: [/警方|通报|回应|事故|案件|法院|医院|天气|暴雨|地震|火灾|救援|出行提醒|民生|公共|起诉|民政局|遗产|离婚|被判|欠债|误拦|community|crime|weather|storm|earthquake|rescue/i]
  },
  {
    id: 'education',
    patterns: [/高考|中考|考研|学校|大学|学生|老师|教育|考试|录取|留学|college|school|exam|student|education/i]
  },
  {
    id: 'health',
    patterns: [/健康|医疗|医院|医生|疾病|疫苗|药|减肥|减脂|健身|体重|workout|health|medical|doctor|vaccine|fitness/i]
  },
  {
    id: 'auto',
    patterns: [/汽车|新能源车|电动车|车企|充电|自动驾驶|特斯拉|比亚迪|本田|激光雷达|小鹏|理想|蔚来|byd|vehicle|ev|car|auto/i]
  },
  {
    id: 'travel',
    patterns: [/旅游|旅行|文旅|景区|酒店|机票|航班|端午|五一|三亚|游泳|travel|trip|hotel|flight/i]
  },
  {
    id: 'food',
    patterns: [/美食|餐饮|咖啡|奶茶|雪糕|外卖|食物|做饭|卤菜|food|coffee|restaurant|street food/i]
  },
  {
    id: 'science',
    patterns: [/航天|神舟|天舟|火箭|卫星|宇宙|空间站|科学|胚胎|太空|space|launch|satellite|science|climate/i]
  },
  {
    id: 'lifestyle',
    patterns: [/母亲节|穿搭|家居|家庭|宠物|亲子|生活|人生|前台|密码|mothersday|desksetup|lifestyle|baby|kids|maternity/i]
  }
];

function platform(id, label, group, groupLabel, market, type, typeLabel) {
  return { id, label, group, groupLabel, market, type, typeLabel };
}

function getPlatformMeta(platformId) {
  return PLATFORM_REGISTRY[platformId] || {
    id: platformId,
    label: platformId,
    group: 'overseas',
    groupLabel: '海外',
    market: 'global',
    type: 'unknown',
    typeLabel: '其他平台'
  };
}

function classifyTrend(title, fallback = 'general', platformId = '') {
  const platformMeta = getPlatformMeta(platformId);
  if (['gaming-news', 'gaming-industry'].includes(platformMeta.type)) {
    return 'gaming';
  }

  const value = String(title || '');
  for (const rule of CATEGORY_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(value))) {
      return rule.id;
    }
  }

  return CATEGORY_REGISTRY[fallback] ? fallback : 'general';
}

function categoryLabel(category) {
  return CATEGORY_REGISTRY[category]?.label || category || CATEGORY_REGISTRY.general.label;
}

module.exports = {
  CATEGORY_REGISTRY,
  PLATFORM_REGISTRY,
  categoryLabel,
  classifyTrend,
  getPlatformMeta
};
