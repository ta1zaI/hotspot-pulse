# 腾讯云宝塔服务器迁移说明

## 保护红线

绝不修改现有重要网站：

```text
edit.ta1zai.com
```

不改它的 DNS、SSL、宝塔站点、Nginx 配置、网站目录和运行进程。

## 新增资源

只新增以下资源：

```text
/www/wwwroot/hotspot-pulse
127.0.0.1:4173
PM2 进程 hotspot-pulse
宝塔站点 daily.ta1zai.com
```

## 服务器环境

需要：

```text
Node.js 20+
git
PM2
Nginx
```

## 部署目录

```bash
git clone https://github.com/ta1zaI/hotspot-pulse.git /www/wwwroot/hotspot-pulse
cd /www/wwwroot/hotspot-pulse
npm install --omit=dev
```

## 生产环境变量

在 `/www/wwwroot/hotspot-pulse/.env` 写入：

```text
HOST=127.0.0.1
PORT=4173
REFRESH_INTERVAL_MINUTES=60
ADMIN_PASSWORD=change-this-admin-password
PUBLIC_DAILY_URL=https://daily.ta1zai.com/daily.html
ACTIVE_PLATFORMS=weibo,bilibili_daily,bilibili_weekly,gameres,gamersky,threedm,gcores,gamelook,douban_nowplaying
WEIBO_SOURCE=official-first
DOUBAN_NOWPLAYING_CITIES=all
```

上线前必须替换 `ADMIN_PASSWORD`。

## 本机测试

```bash
npm start
curl http://127.0.0.1:4173/health
curl http://127.0.0.1:4173/api/trends
```

确认正常后再交给 PM2。

## PM2 托管

```bash
pm2 start src/server.js --name hotspot-pulse --max-memory-restart 300M
pm2 save
```

先观察一天，再配置开机自启。

## 宝塔站点

新增站点：

```text
daily.ta1zai.com
```

反向代理：

```text
http://127.0.0.1:4173
```

## Cloudflare DNS

只新增或修改：

```text
daily  A  43.128.23.126
```

不要修改：

```text
edit
api
hotlist
img
translate
MX
TXT
```

## 验收

检查：

```text
https://edit.ta1zai.com/ 仍然正常
https://daily.ta1zai.com/ 正常
https://daily.ta1zai.com/daily.html 正常
https://daily.ta1zai.com/health 返回 {"ok":true}
```
