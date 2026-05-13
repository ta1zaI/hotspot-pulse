# Hotspot Pulse

一个多平台热点聚合站 MVP。当前版本已经包含微博、X、TikTok 三个平台的采集器接口、聚合评分、快照存储和可视化看板。

## 运行

```bash
node src/server.js
```

打开：

```text
http://localhost:4173
```

## 数据源

当前默认使用示例数据，方便先跑通产品闭环。现在已经支持逐个平台接真实数据源：

- X：默认使用免费的 Trends24 公开趋势页，不调用付费 X API；如果以后要用官方接口，设置 `X_SOURCE=api` 并配置 `X_BEARER_TOKEN`。
- 微博：默认 `WEIBO_SOURCE=official-first`，优先使用微博官方热搜页和 `WEIBO_COOKIE`，失败时回退到免费公开 JSON 源 `api.52vmy.cn`。如果只想用官方页，可设置 `WEIBO_SOURCE=official`。
- TikTok：默认解析 TikTok Creative Center 的公开 hashtag 趋势页；如果以后要接数据商或自己的采集器，可设置 `TIKTOK_SOURCE=custom-json` 和 `TIKTOK_TRENDS_URL`。

服务启动后会自动生成一次热点快照，并按 `REFRESH_INTERVAL_MINUTES` 设置的分钟数自动刷新。默认 30 分钟。

复制 `.env.example` 为 `.env` 后填写密钥：

```text
X_BEARER_TOKEN=你的 X Bearer Token
X_SOURCE=trends24
WEIBO_COOKIE=你的微博 Cookie
TIKTOK_TRENDS_URL=https://your-provider.example/trends/tiktok
```

## 主要目录

```text
public/              前端页面
src/connectors/      各平台采集器
src/services/        聚合、存储、采集调度
data/trends.json     最近一次热点快照
```

## 分类方式

当前使用两层分类：

- 平台地域：`domestic` 国内、`overseas` 海外。当前国内包含微博、游民星空、3DM游戏网、游研社、机核网、B站日榜、B站周榜；海外包含 X、TikTok。
- 平台类型：社交热搜、游戏资讯、视频榜单。侧边栏会按类型自动分组，数据源状态默认折叠。
- 热点行业：政务国际、科技数码、财经商业、影视娱乐、体育赛事、社会民生、教育考试、健康医疗、游戏电竞、汽车出行、旅行文旅、餐饮美食、生活消费、科学探索、综合热点。

平台和行业规则集中放在 `src/services/taxonomy.js`。后续新增平台时，新增一个 connector，再在 `PLATFORM_REGISTRY` 里登记平台归属即可。

## 下一步建议

1. 接入真实 X API token。
2. 为微博和 TikTok 选择稳定合规的数据源。
3. 将 `data/trends.json` 换成 PostgreSQL，保留历史趋势曲线。
4. 增加登录、收藏、日报和 AI 摘要。
