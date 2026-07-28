Reading additional input from stdin...
2026-07-28T23:34:23.103450Z ERROR codex_models_manager::cache: failed to load models cache: missing field `supports_reasoning_summaries` at line 87 column 5
OpenAI Codex v0.144.4
--------
workdir: /Users/antemo/studyloop
model: gpt-5.6-sol
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 019fab14-5195-7d72-b39c-af279fc30921
--------
user
You are the design critic (cross-validation pass). The premium design spec is design/DESIGN.md (adjudicated from design-spec-codex.md + design-spec-kimi.md). The implementation just landed (commit 8b339d5). LOOK at the result screenshots design/v2-d-home.png, v2-d-watch.png, v2-d-modal.png, v2-d-rail.png and compare against design/reference-youtube.png and the spec's acceptance criteria; also spot-check the CSS (web/src/index.css and any *.module.css you doubt). Report: (1) acceptance criteria pass/fail each, (2) remaining non-premium tells ranked P0/P1/P2 with the concrete CSS/markup fix for each, (3) anything that regressed vs the earlier screenshots (v2-a-watch.png, v2-c-analysis.png). Be harsh; the bar is 'indistinguishable from a first-party YouTube product'.
codex
I’m using the design-review workflow here because this is a visual cross-validation pass. I’ll inspect the adjudicated spec, compare every requested screenshot at full resolution, then trace visible issues back to the relevant CSS and markup.
exec
/bin/zsh -lc "sed -n '1,240p' /Users/antemo/.agents/skills/huashu-design/SKILL.md" in /Users/antemo/studyloop
 succeeded in 0ms:
---
name: huashu-design
description: Expert capabilities for high-fidelity HTML prototypes, interactive demos, slides, and animations. Use for UX prototyping, design exploration, visual presentations, and expert design reviews.
---

# 花叔Design · Huashu-Design

你是一位用HTML工作的设计师，不是程序员。用户是你的manager，你产出深思熟虑、做工精良的设计作品。
- **交互原型**：高保真产品mockup，用户可以点击、切换、感受流程
- **设计变体探索**：并排对比多个设计方向，或用Tweaks实时调参
- **演示幻灯片**：1920×1080的HTML deck，可以当PPT用
- **动画Demo**：时间轴驱动的motion design，做视频素材或概念演示
- **信息图/可视化**：精确排版、数据驱动、印刷级质量

不适用场景：生产级Web App、SEO网站、需要后端的动态系统——这些用frontend-design skill。

## 核心原则 #0 · 事实验证先于假设（优先级最高，凌驾所有其他流程）

> **任何涉及具体产品/技术/事件/人物的存在性、发布状态、版本号、规格参数的事实性断言，第一步必须 `WebSearch` 验证，禁止凭训练语料做断言。**

**触发条件（满足任一）**：
- 用户提到你不熟悉或不确定的具体产品名（如"大疆 Pocket 4"、"Nano Banana Pro"、"Gemini 3 Pro"、某新版 SDK）
- 涉及 2024 年及之后的发布时间线、版本号、规格参数
- 你内心冒出"我记得好像是..."、"应该还没发布"、"大概在..."、"可能不存在"的句式
- 用户请求给某个具体产品/公司做设计物料

**硬流程（开工前执行，优先于 clarifying questions）**：
1. `WebSearch` 产品名 + 最新时间词（"2026 latest"、"launch date"、"release"、"specs"）
2. 读 1-3 条权威结果，确认：**存在性 / 发布状态 / 最新版本号 / 关键规格**
3. 把事实写进项目的 `product-facts.md`（见工作流 Step 2），不靠记忆
4. 搜不到或结果模糊 → 问用户，而不是自行假设

**反例**（2026-04-20 真实踩过的坑）：
- 用户："给大疆 Pocket 4 做发布动画"
- 我：凭记忆说"Pocket 4 还没发布，我们做概念 demo"
- 真相：Pocket 4 已在 4 天前（2026-04-16）发布，官方 Launch Film + 产品渲染图俱在
- 后果：基于错误假设做了"概念剪影"动画，违背用户期待，返工 1-2 小时
- **成本对比：WebSearch 10 秒 << 返工 2 小时**

**这条原则优先级高于"问 clarifying questions"**——问问题的前提是你对事实已有正确理解。事实错了，问什么都是歪的。

**禁止句式（看到自己要说这些时，立即停下去搜）**：
- ❌ "我记得 X 还没发布"
- ❌ "X 目前是 vN 版本"（未经搜索的断言）
- ❌ "X 这个产品可能不存在"
- ❌ "据我所知 X 的规格是..."
- ✅ "我 `WebSearch` 一下 X 最新状态"
- ✅ "搜到的权威来源说 X 是 ..."

**与"品牌资产协议"的关系**：本原则是资产协议的**前提**——先确认产品存在且是什么，再去找它的 logo/产品图/色值。顺序不能反。

---

## 核心哲学（优先级从高到低）

### 1. 从existing context出发，不要凭空画

好的hi-fi设计**一定**是从已有上下文长出来的。先问用户是否有design system/UI kit/codebase/Figma/截图。**凭空做hi-fi是last resort，一定会产出generic的作品**。如果用户说没有，先帮他去找（看项目里有没有，看有没有参考品牌）。

**如果还是没有，或者用户需求表达很模糊**（如"做个好看的页面"、"帮我设计"、"不知道要什么风格"、"做个XX"没有具体参考），**不要凭通用直觉硬做**——进入 **设计方向顾问模式**，从 20 种设计哲学里给 3 个差异化方向让用户选。完整流程见下方「设计方向顾问（Fallback 模式）」大节。

#### 1.a 核心资产协议（涉及具体品牌时强制执行）

> **这是 v1 最核心的约束，也是稳定性的生命线。** Agent 是否走通这个协议，直接决定输出质量是 40 分还是 90 分。不要跳过任何一步。
>
> **v1.1 重构（2026-04-20）**：从「品牌资产协议」升级为「核心资产协议」。之前的版本过度聚焦色值和字体，漏掉了设计中最基础的 logo / 产品图 / UI 截图。花叔的原话：「除了所谓的品牌色，显然我们应该找到并且用上大疆的 logo，用上 pocket4 的产品图。如果是网站或者 app 等非实体产品的话，logo 至少该是必须的。这可能是比所谓的品牌设计的 spec 更重要的基本逻辑。否则，我们在表达什么呢？」

**触发条件**：任务涉及具体品牌——用户提了产品名/公司名/明确客户（Stripe、Linear、Anthropic、Notion、Lovart、DJI、自家公司等），不论用户是否主动提供了品牌资料。

**前置硬条件**：走协议前必须已通过「#0 事实验证先于假设」确认品牌/产品存在且状态已知。如果你还不确定产品是否已发布/规格/版本，先回去搜。

##### 核心理念：资产 > 规范

**品牌的本质是「它被认出来」**。认出来靠什么？按识别度排序：

| 资产类型 | 识别度贡献 | 必需性 |
|---|---|---|
| **Logo** | 最高 · 任何品牌出现 logo 就一眼识别 | **任何品牌都必须有** |
| **产品图/产品渲染图** | 极高 · 实体产品的"主角"就是产品本身 | **实体产品（硬件/包装/消费品）必须有** |
| **UI 截图/界面素材** | 极高 · 数字产品的"主角"是它的界面 | **数字产品（App/网站/SaaS）必须有** |
| **色值** | 中 · 辅助识别，脱离前三项时经常撞衫 | 辅助 |
| **字体** | 低 · 需配合前述才能建立识别 | 辅助 |
| **气质关键词** | 低 · agent 自检用 | 辅助 |

**翻译成执行规则**：
- 只抽色值 + 字体、不找 logo / 产品图 / UI → **违反本协议**
- 用 CSS 剪影/SVG 手画替代真实产品图 → **违反本协议**（生成的就是「通用科技动画」，任何品牌都长一样）
- 找不到资产不告诉用户、也不 AI 生成，硬做 → **违反本协议**
- 宁可停下问用户要素材，也不要用 generic 填充

##### 5 步硬流程（每步有 fallback，绝不静默跳过）

##### Step 1 · 问（资产清单一次问全）

不要只问「有 brand guidelines 吗？」——太宽泛，用户不知道该给什么。按清单逐项问：

```
关于 <brand/product>，你手上有以下哪些资料？我按优先级列：
1. Logo（SVG / 高清 PNG）—— 任何品牌必备
2. 产品图 / 官方渲染图 —— 实体产品必备（如 DJI Pocket 4 的产品照）
3. UI 截图 / 界面素材 —— 数字产品必备（如 App 主要页面截图）
4. 色值清单（HEX / RGB / 品牌色盘）
5. 字体清单（Display / Body）
6. Brand guidelines PDF / Figma design system / 品牌官网链接

有的直接发我，没有的我去搜/抓/生成。
```

##### Step 2 · 搜官方渠道（按资产类型）

| 资产 | 搜索路径 |
|---|---|
| **Logo** | `<brand>.com/brand` · `<brand>.com/press` · `<brand>.com/press-kit` · `brand.<brand>.com` · 官网 header 的 inline SVG |
| **产品图/渲染图** | `<brand>.com/<product>` 产品详情页 hero image + gallery · 官方 YouTube launch film 截帧 · 官方新闻稿附图 |
| **UI 截图** | App Store / Google Play 产品页截图 · 官网 screenshots section · 产品官方演示视频截帧 |
| **色值** | 官网 inline CSS / Tailwind config / brand guidelines PDF |
| **字体** | 官网 `<link rel="stylesheet">` 引用 · Google Fonts 追踪 · brand guidelines |

`WebSearch` 兜底关键词：
- Logo 找不到 → `<brand> logo download SVG`、`<brand> press kit`
- 产品图找不到 → `<brand> <product> official renders`、`<brand> <product> product photography`
- UI 找不到 → `<brand> app screenshots`、`<brand> dashboard UI`

##### Step 3 · 下载资产 · 按类型三条兜底路径

**3.1 Logo（任何品牌必需）**

三条路径按成功率递减：
1. 独立 SVG/PNG 文件（最理想）：
   ```bash
   curl -o assets/<brand>-brand/logo.svg https://<brand>.com/logo.svg
   curl -o assets/<brand>-brand/logo-white.svg https://<brand>.com/logo-white.svg
   ```
2. 官网 HTML 全文提取 inline SVG（80% 场景必用）：
   ```bash
   curl -A "Mozilla/5.0" -L https://<brand>.com -o assets/<brand>-brand/homepage.html
   # 然后 grep <svg>...</svg> 提取 logo 节点
   ```
3. 官方社交媒体 avatar（最后手段）：GitHub/Twitter/LinkedIn 的公司头像通常是 400×400 或 800×800 透明底 PNG

**3.2 产品图/渲染图（实体产品必需）**

按优先级：
1. **官方产品页 hero image**（最高优先级）：右键查看图片地址 / curl 获取。分辨率通常 2000px+
2. **官方 press kit**：`<brand>.com/press` 常有高清产品图下载
3. **官方 launch video 截帧**：用 `yt-dlp` 下载 YouTube 视频，ffmpeg 抽几帧高清图
4. **Wikimedia Commons**：公共领域常有
5. **AI 生成兜底**（nano-banana-pro）：把真实产品图作为参考发给 AI，让它生成符合动画场景的变体。**不要用 CSS/SVG 手画代替**

```bash
# 示例：下载 DJI 官网产品 hero image
curl -A "Mozilla/5.0" -L "<hero-image-url>" -o assets/<brand>-brand/product-hero.png
```

**3.3 UI 截图（数字产品必需）**

- App Store / Google Play 的产品截图（注意：可能是 mockup 而非真实 UI，要对比）
- 官网 screenshots section
- 产品演示视频截帧
- 产品官方 Twitter/X 的发布截图（常是最新版本）
- 用户有账号时，直接截屏真实产品界面

**3.4 · 素材质量门槛「5-10-2-8」原则（铁律）**

> **Logo 的规则不同于其他素材**。Logo 有就必须用（没有就停下问用户）；其他素材（产品图/UI/参考图/配图）遵循「5-10-2-8」质量门槛。
>
> 2026-04-20 花叔原话：「我们的原则是搜索 5 轮，找到 10 个素材，选择 2 个好的。每个需要评分 8/10 以上，宁可少一些，也不为了完成任务滥竽充数。」

| 维度 | 标准 | 反模式 |
|---|---|---|
| **5 轮搜索** | 多渠道交叉搜（官网 / press kit / 官方社媒 / YouTube 截帧 / Wikimedia / 用户账号截屏），不是一轮抓前 2 个就停 | 第一页结果直接用 |
| **10 个候选** | 至少凑 10 个备选才开始筛 | 只抓 2 个，没得选 |
| **选 2 个好的** | 从 10 个里精选 2 个作为最终素材 | 全都用 = 视觉过载 + 品位稀释 |
| **每个 8/10 分以上** | 不够 8 分**宁可不用**，用诚实 placeholder（灰块+文字标签）或 AI 生成（nano-banana-pro 以官方参考为基底）| 凑数 7 分素材进 brand-spec.md |

**8/10 评分维度**（打分时记录在 `brand-spec.md`）：

1. **分辨率** · ≥2000px（印刷/大屏场景 ≥3000px）
2. **版权清晰度** · 官方来源 > 公共领域 > 免费素材 > 疑似盗图（疑似盗图直接 0 分）
3. **与品牌气质契合度** · 和 brand-spec.md 里的「气质关键词」一致
4. **光线/构图/风格一致性** · 2 个素材放一起不打架
5. **独立叙事能力** · 能单独表达一个叙事角色（不是装饰）

**为什么这个门槛是铁律**：
- 花叔的哲学：**宁缺毋滥**。滥竽充数的素材比没有更糟——污染视觉品味、传递「不专业」信号
- **「一个细节做到 120%，其他做到 80%」的量化版**：8 分是"其他 80%" 的底线，真正 hero 素材要 9-10 分
- 消费者看作品时，每一个视觉元素都在**积分或扣分**。7 分素材 = 扣分项，不如留空

**Logo 例外**（重申）：有就必须用，不适用「5-10-2-8」。因为 logo 不是「多选一」问题，而是「识别度根基」问题——就算 logo 本身只有 6 分，也比没有 logo 强 10 倍。

##### Step 4 · 验证 + 提取（不只是 grep 色值）

| 资产 | 验证动作 |
|---|---|
| **Logo** | 文件存在 + SVG/PNG 可打开 + 至少两个版本（深底/浅底用）+ 透明背景 |
| **产品图** | 至少一张 2000px+ 分辨率 + 去背或干净背景 + 多个角度（主视角、细节、场景） |
| **UI 截图** | 分辨率真实（1x / 2x）+ 是最新版本（不是旧版）+ 无用户数据污染 |
| **色值** | `grep -hoE '#[0-9A-Fa-f]{6}' assets/<brand>-brand/*.{svg,html,css} \| sort \| uniq -c \| sort -rn \| head -20`，过滤黑白灰 |

**警惕示范品牌污染**：产品截图里常有用户 demo 的品牌色（如某工具截图演示喜茶红），那不是该工具的色。**同时出现两种强色时必须区分**。

**品牌多切面**：同一品牌的官网营销色和产品 UI 色经常不同（Lovart 官网暖米+橙，产品 UI 是 Charcoal + Lime）。**两套都是真的**——根据交付场景选合适的切面。

##### Step 5 · 固化为 `brand-spec.md` 文件（模板必须覆盖所有资产）

```markdown
# <Brand> · Brand Spec
> 采集日期：YYYY-MM-DD
> 资产来源：<列出下载来源>
> 资产完整度：<完整 / 部分 / 推断>

## 🎯 核心资产（一等公民）

### Logo
- 主版本：`assets/<brand>-brand/logo.svg`
- 浅底反色版：`assets/<brand>-brand/logo-white.svg`
- 使用场景：<片头/片尾/角落水印/全局>
- 禁用变形：<不能拉伸/改色/加描边>

### 产品图（实体产品必填）
- 主视角：`assets/<brand>-brand/product-hero.png`（2000×1500）
- 细节图：`assets/<brand>-brand/product-detail-1.png` / `product-detail-2.png`
- 场景图：`assets/<brand>-brand/product-scene.png`
- 使用场景：<特写/旋转/对比>

### UI 截图（数字产品必填）
- 主页：`assets/<brand>-brand/ui-home.png`
- 核心功能：`assets/<brand>-brand/ui-feature-<name>.png`
- 使用场景：<产品展示/Dashboard 渐现/对比演示>

## 🎨 辅助资产

### 色板
- Primary: #XXXXXX  <来源标注>
- Background: #XXXXXX
- Ink: #XXXXXX
- Accent: #XXXXXX
- 禁用色: <品牌明确不用的色系>

### 字型

exec
/bin/zsh -lc "sed -n '241,520p' /Users/antemo/.agents/skills/huashu-design/SKILL.md" in /Users/antemo/studyloop
 succeeded in 0ms:
- Display: <font stack>
- Body: <font stack>
- Mono（数据 HUD 用）: <font stack>

### 签名细节
- <哪些细节是「120% 做到」的>

### 禁区
- <明确不能做的：比如 Lovart 不用蓝色、Stripe 不用低饱和暖色>

### 气质关键词
- <3-5 个形容词>
```

**写完 spec 后的执行纪律（硬要求）**：
- 所有 HTML 必须**引用** `brand-spec.md` 里的资产文件路径，不允许用 CSS 剪影/SVG 手画代替
- Logo 作为 `<img>` 引用真实文件，不重画
- 产品图作为 `<img>` 引用真实文件，不用 CSS 剪影代替
- CSS 变量从 spec 注入：`:root { --brand-primary: ...; }`，HTML 只用 `var(--brand-*)`
- 这让品牌一致性从「靠自觉」变成「靠结构」——想临时加色要先改 spec

##### 全流程失败的兜底

按资产类型分别处理：

| 缺失 | 处理 |
|---|---|
| **Logo 完全找不到** | **停下问用户**，不要硬做（logo 是品牌识别度的根基） |
| **产品图（实体产品）找不到** | 优先 nano-banana-pro AI 生成（以官方参考图为基底）→ 次选向用户索取 → 最后才是诚实 placeholder（灰块+文字标签，明确标注"产品图待补"） |
| **UI 截图（数字产品）找不到** | 向用户索取自己账号的截屏 → 官方演示视频截帧。不用 mockup 生成器凑 |
| **色值完全找不到** | 按「设计方向顾问模式」走，向用户推荐 3 个方向并标注 assumption |

**禁止**：找不到资产就静默用 CSS 剪影/通用渐变硬做——这是协议最大的反 pattern。**宁可停下问，也不要凑**。

##### 反例（真实踩过的坑）

- **Kimi 动画**：凭记忆猜「应该是橙色」，实际 Kimi 是 `#1783FF` 蓝色——返工一遍
- **Lovart 设计**：把产品截图里演示品牌的喜茶红当成 Lovart 自己的色——差点毁整个设计
- **DJI Pocket 4 发布动画（2026-04-20，触发本协议升级的真实案例）**：走了旧版只抽色值的协议，没下载 DJI logo、没找 Pocket 4 产品图，用 CSS 剪影代替产品——做出来是「通用黑底+橙 accent 的科技动画」，没有大疆识别度。花叔原话：「否则，我们在表达什么呢？」→ 协议升级。
- 抽完色没写进 brand-spec.md，第三页就忘了主色数值，临场加了个「接近但不是」的 hex——品牌一致性崩溃

##### 协议代价 vs 不做代价

| 场景 | 时间 |
|---|---|
| 正确走完协议 | 下载 logo 5 min + 下载 3-5 张产品图/UI 10 min + grep 色值 5 min + 写 spec 10 min = **30 分钟** |
| 不做协议的代价 | 做出没识别度的通用动画 → 用户返工 1-2 小时，甚至重做 |

**这是稳定性最便宜的投资**。尤其对商单/发布会/重要客户项目，30 分钟的资产协议是保命钱。

### 2. Junior Designer模式：先展示假设，再执行

你是manager的junior designer。**不要一头扎进去闷头做大招**。HTML文件的开头先写下你的assumptions + reasoning + placeholders，**尽早show给用户**。然后：
- 用户确认方向后，再写React组件填placeholder
- 再show一次，让用户看进度
- 最后迭代细节

这个模式的底层逻辑是：**理解错了早改比晚改便宜100倍**。

### 3. 给variations，不给「最终答案」

用户要你设计，不要给一个完美方案——给3+个变体，跨不同维度（视觉/交互/色彩/布局/动画），**从by-the-book到novel逐级递进**。让用户mix and match。

实现方式：
- 纯视觉对比 → 用`design_canvas.jsx`并排展示
- 交互流程/多选项 → 做完整原型，把选项做成Tweaks

### 4. Placeholder > 烂实现

没图标就留灰色方块+文字标签，别画烂SVG。没数据就写`<!-- 等用户提供真实数据 -->`，别编造看起来像数据的假数据。**Hi-fi里，一个诚实的placeholder比一个拙劣的真实尝试好10倍**。

### 5. 系统优先，不要填充

**Don't add filler content**。每个元素都必须earn its place。空白是设计问题，用构图解决，不是靠编造内容填满。**One thousand no's for every yes**。尤其警惕：
- 「data slop」——没用的数字、图标、stats装饰
- 「iconography slop」——每个标题都配icon
- 「gradient slop」——所有背景都渐变

### 6. 反AI slop（重要，必读）

#### 6.1 什么是 AI slop？为什么要反？

**AI slop = AI 训练语料里最常见的"视觉最大公约数"**。
紫渐变、emoji 图标、圆角卡片+左 border accent、SVG 画人脸——这些东西之所以是 slop，不是因为它们本身丑，而是因为**它们是 AI 默认模式下的产物，不携带任何品牌信息**。

**规避 slop 的逻辑链**：
1. 用户请你做设计，是要**他的品牌被认出来**
2. AI 默认产出 = 训练语料的平均 = 所有品牌混合 = **没有任何品牌被认出来**
3. 所以 AI 默认产出 = 帮用户把品牌稀释成"又一个 AI 做的页面"
4. 反 slop 不是审美洁癖，是**替用户保护品牌识别度**

这也是为什么 §1.a 品牌资产协议是 v1 最硬的约束——**服从规范是反 slop 的正向方式**（对的事），清单只是反 slop 的反向方式（不做错的事）。

#### 6.2 核心要规避的（带"为什么"）

| 元素 | 为什么是 slop | 什么情况可以用 |
|------|-------------|---------------|
| 激进紫色渐变 | AI 训练语料里"科技感"的万能公式，出现在 SaaS/AI/web3 每一个落地页 | 品牌本身用紫渐变（如 Linear 某些场景）、或任务就是讽刺/展示这类 slop |
| Emoji 作图标 | 训练语料里每个 bullet 都配 emoji，是"不够专业就用 emoji 凑"的病 | 品牌本身用（如 Notion），或产品受众是儿童/轻松场景 |
| 圆角卡片 + 左彩色 border accent | 2020-2024 Material/Tailwind 时期的烂大街组合，已成视觉噪音 | 用户明确要求、或这个组合在品牌 spec 里被保留 |
| SVG 画 imagery（人脸/场景/物品）| AI 画的 SVG 人物永远五官错位，比例诡异 | **几乎没有**——有图就用真图（Wikimedia/Unsplash/AI 生成），没图就留诚实 placeholder |
| **CSS 剪影/SVG 手画代替真实产品图** | 生成的就是「通用科技动画」——黑底+橙 accent+圆角长条，任何实体产品都长一样，品牌识别度归零（DJI Pocket 4 实测 2026-04-20）| **几乎没有**——先走核心资产协议找真实产品图；真没有时用 nano-banana-pro 以官方参考图为基底生成；实在不行标诚实 placeholder 告诉用户"产品图待补" |
| Inter/Roboto/Arial/system fonts 作 display | 太常见，读者看不出这是"有设计的产品"还是"demo 页" | 品牌 spec 明确用这些字体（Stripe 用 Sohne/Inter 变体，但是经过微调的） |
| 赛博霓虹 / 深蓝底 `#0D1117` | GitHub dark mode 美学的烂大街复制 | 开发者工具产品且品牌本身走这方向 |

**判断边界**：「品牌本身用」是唯一能合法破例的理由。品牌 spec 里明写了用紫渐变，那就用——此时它不再是 slop，是品牌签名。

#### 6.3 正向做什么（带"为什么"）

- ✅ `text-wrap: pretty` + CSS Grid + 高级 CSS：排版细节是 AI 分不清的"品味税"，会用这些的 agent 看起来像真设计师
- ✅ 用 `oklch()` 或 spec 里已有的色，**不凭空发明新颜色**：所有临场发明的色都会让品牌识别度下降
- ✅ 配图优先 AI 生成（Gemini / Flash / Lovart），HTML 截图仅在精确数据表格时用：AI 生成的图比 SVG 手画准确，比 HTML 截图有质感
- ✅ 文案用「」引号不用 ""：中文排印规范，也是"有审校过"的细节信号
- ✅ 一个细节做到 120%，其他做到 80%：品味 = 在合适的地方足够精致，不是均匀用力

#### 6.4 反例隔离（演示型内容）

当任务本身就要展示反设计（如本任务就是讲"什么是 AI slop"、或对比评测），**不要整页堆 slop**，而是用**诚实的 bad-sample 容器**隔离——加虚线边框 + "反例 · 不要这样做" 角标，让反例服务于叙事而不是污染页面主调。

这不是硬规则（不做成模板），是原则：**反例要看得出是反例，不是让页面真的变成 slop**。

完整清单见 `references/content-guidelines.md`。

## 设计方向顾问（Fallback 模式）

**什么时候触发**：
- 用户需求模糊（"做个好看的"、"帮我设计"、"这个怎么样"、"做个XX"没有具体参考）
- 用户明确要"推荐风格"、"给几个方向"、"选个哲学"、"想看不同风格"
- 项目和品牌没有任何 design context（既没有 design system，又找不到参考）
- 用户主动说"我也不知道要什么风格"

**什么时候 skip**：
- 用户已经给了明确的风格参考（Figma / 截图 / 品牌规范）→ 直接走「核心哲学 #1」主干流程
- 用户已经说清楚要什么（"做个 Apple Silicon 风格的发布会动画"）→ 直接进 Junior Designer 流程
- 小修小补、明确的工具调用（"帮我把这段 HTML 变成 PDF"）→ skip

不确定就用最轻量版：**列出 3 个差异化方向让用户二选一，不展开不生成**——尊重用户节奏。

### 完整流程（8 个 Phase，顺序执行）

**Phase 1 · 深度理解需求**
提问（一次最多 3 个）：目标受众 / 核心信息 / 情感基调 / 输出格式。需求已清晰则跳过。

**Phase 2 · 顾问式重述**（100-200 字）
用自己的话重述本质需求、受众、场景、情感基调。以「基于这个理解，我为你准备了 3 个设计方向」结尾。

**Phase 3 · 推荐 3 套设计哲学**（必须差异化）

每个方向必须：
- **含设计师/机构名**（如「Kenya Hara 式东方极简」，不是只说「极简主义」）
- 50-100 字解释「为什么这个设计师适合你」
- 3-4 条标志性视觉特征 + 3-5 个气质关键词 + 可选代表作

**差异化规则**（必守）：3 个方向**必须来自 3 个不同流派**，形成明显视觉反差：

| 流派 | 视觉气质 | 适合作为 |
|------|---------|---------|
| 信息建筑派（01-04） | 理性、数据驱动、克制 | 安全/专业选择 |
| 运动诗学派（05-08） | 动感、沉浸、技术美学 | 大胆/前卫选择 |
| 极简主义派（09-12） | 秩序、留白、精致 | 安全/高端选择 |
| 实验先锋派（13-16） | 先锋、生成艺术、视觉冲击 | 大胆/创新选择 |
| 东方哲学派（17-20） | 温润、诗意、思辨 | 差异化/独特选择 |

❌ **禁止从同一流派推荐 2 个以上** — 差异化不够用户看不出区别。

详细 20 种风格库 + AI 提示词模板 → `references/design-styles.md`。

**Phase 4 · 展示预制 Showcase 画廊**

推荐 3 方向后，**立即检查** `assets/showcases/INDEX.md` 是否有匹配的预制样例（8 场景 × 3 风格 = 24 个样例）：

| 场景 | 目录 |
|------|------|
| 公众号封面 | `assets/showcases/cover/` |
| PPT 数据页 | `assets/showcases/ppt/` |
| 竖版信息图 | `assets/showcases/infographic/` |
| 个人主页 / AI 导航 / AI 写作 / SaaS / 开发文档 | `assets/showcases/website-*/` |

匹配话术：「在启动实时 Demo 之前，先看看这 3 个风格在类似场景的效果 →」然后 Read 对应 .png。

场景模板按输出类型组织 → `references/scene-templates.md`。

**Phase 5 · 生成 3 个视觉 Demo**

> 核心理念：**看到比说到更有效。** 别让用户凭文字想象，直接看。

为 3 个方向各生成一个 Demo——**如果当前 agent 支持 subagent 并行**，启动 3 个并行子任务（后台执行）；**不支持就串行生成**（先后做 3 次，同样能用）。两种路径都能工作：
- 使用**用户真实内容/主题**（不是 Lorem ipsum）
- HTML 存 `_temp/design-demos/demo-[风格].html`
- 截图：`npx playwright screenshot file:///path.html out.png --viewport-size=1200,900`
- 全部完成后一起展示 3 张截图

风格类型路径：
| 风格最佳路径 | Demo 生成方式 |
|-------------|--------------|
| HTML 型 | 生成完整 HTML → 截图 |
| AI 生成型 | `nano-banana-pro` 用风格 DNA + 内容描述 |
| 混合型 | HTML 布局 + AI 插画 |

**Phase 6 · 用户选择**：选一个深化 / 混合（"A 的配色 + C 的布局"）/ 微调 / 重来 → 回 Phase 3 重新推荐。

**Phase 7 · 生成 AI 提示词**
结构：`[设计哲学约束] + [内容描述] + [技术参数]`
- ✅ 用具体特征而非风格名（写「Kenya Hara 的留白感+赤土橙 #C04A1A」，不写「极简」）
- ✅ 包含颜色 HEX、比例、空间分配、输出规格
- ❌ 避开审美禁区（见反 AI slop）

**Phase 8 · 选定方向后进入主干**
方向确认 → 回到「核心哲学」+「工作流程」的 Junior Designer pass。这时已经有明确的 design context，不再是凭空做。

**真实素材优先原则**（涉及用户本人/产品时）：
1. 先查用户配置的**私有 memory 路径**下的 `personal-asset-index.json`（Claude Code 默认在 `~/.claude/memory/`；其他 agent 按其自身约定）
2. 首次使用：复制 `assets/personal-asset-index.example.json` 到上述私有路径，填入真实数据
3. 找不到就直接问用户要，不要编造——真实数据文件不要放在 skill 目录内避免随分发泄露隐私

## App / iOS 原型专属守则

做 iOS/Android/移动 app 原型时（触发：「app 原型」「iOS mockup」「移动应用」「做个 app」），下面四条**覆盖**通用 placeholder 原则——app 原型是 demo 现场，静态摆拍和米白占位卡没有说服力。

### 0. 架构选型（必先决定）

**默认单文件 inline React**——所有 JSX/data/styles 直接写进主 HTML 的 `<script type="text/babel">...</script>` 标签，**不要**用 `<script src="components.jsx">` 外部加载。原因：`file://` 协议下浏览器把外部 JS 当跨 origin 拦截，强制用户起 HTTP server 违反「双击就能开」的原型直觉。引用本地图片必须 base64 内嵌 data URL，别假设有 server。

**拆外部文件只在两种情况**：
- (a) 单文件 >1000 行难维护 → 拆成 `components.jsx` + `data.js`，同时明确交付说明（`python3 -m http.server` 命令 + 访问 URL）
- (b) 需要多 subagent 并行写不同屏 → `index.html` + 每屏独立 HTML（`today.html`/`graph.html`...），iframe 聚合，每屏也都是自包含单文件

**选型速查**：

| 场景 | 架构 | 交付方式 |
|------|------|----------|
| 单人做 4-6 屏原型（主流） | 单文件 inline | 一个 `.html` 双击开 |
| 单人做大型 App（>10 屏） | 多 jsx + server | 附启动命令 |
| 多 agent 并行 | 多 HTML + iframe | `index.html` 聚合，每屏独立可开 |

### 1. 先找真图，不是 placeholder 摆着

默认主动去取真实图片填充，不要画 SVG、不要拿米白卡摆着、不要等用户要求。常用渠道：

| 场景 | 首选渠道 |
|------|---------|
| 美术/博物馆/历史内容 | Wikimedia Commons（公共领域）、Met Museum Open Access、Art Institute of Chicago API |
| 通用生活/摄影 | Unsplash、Pexels（免版权） |
| 用户本地已有素材 | `~/Downloads`、项目 `_archive/` 或用户配置的素材库 |

Wikimedia 下载避坑（本机 curl 走代理 TLS 会炸，Python urllib 直接走得通）：

```python
# 合规 User-Agent 是硬性要求，否则 429
UA = 'ProjectName/0.1 (https://github.com/you; you@example.com)'
# 用 MediaWiki API 查真实 URL
api = 'https://commons.wikimedia.org/w/api.php'
# action=query&list=categorymembers 批量拿系列 / prop=imageinfo+iiurlwidth 取指定宽度 thumburl
```

**只有**当所有渠道都失败 / 版权不清 / 用户明确要求时，才退回诚实 placeholder（仍然不画烂 SVG）。

**真图诚实性测试**（关键）：取图之前先问自己——「如果去掉这张图，信息是否有损？」

| 场景 | 判断 | 动作 |
|------|------|------|
| 文章/Essay 列表的封面、Profile 页的风景头图、设置页的装饰 banner | 装饰，与内容无内在关联 | **不要加**。加了就是 AI slop，等同紫色渐变 |
| 博物馆/人物内容的肖像、产品详情的实物、地图卡片的地点 | 内容本身，有内在关联 | **必须加** |
| 图谱/可视化背景的极淡纹理 | 氛围，服从内容不抢戏 | 加，但 opacity ≤ 0.08 |

**反例**：给文字 Essay 配 Unsplash「灵感图」、给笔记 App 配 stock photo 模特——都是 AI slop。取真图的许可不等于滥用真图的通行证。

### 2. 交付形态：overview 平铺 / flow demo 单机——先问用户要哪种

多屏 App 原型有两种标准交付形态，**先问用户要哪种**，不要默认挑一种闷头做：

| 形态 | 何时用 | 做法 |
|------|--------|------|
| **Overview 平铺**（设计 review 默认）| 用户要看全貌 / 比较布局 / 走查设计一致性 / 多屏并排 | **所有屏并排静态展示**，每屏一台独立 iPhone，内容完整，不需要可点击 |
| **Flow demo 单机** | 用户要演示一条特定用户流程（如 onboarding、购买链路）| 单台 iPhone，内嵌 `AppPhone` 状态管理器，tab bar / 按钮 / 标注点都能点 |

**路由关键词**：
- 任务里出现「平铺 / 展示所有页面 / overview / 看一眼 / 比较 / 所有屏」→ 走 **overview**
- 任务里出现「演示流程 / 用户路径 / 走一遍 / clickable / 可交互 demo」→ 走 **flow demo**
- 不确定就问。不要默认选 flow demo（它更费工，不是所有任务都需要）

exec
/bin/zsh -lc "sed -n '521,1040p' /Users/antemo/.agents/skills/huashu-design/SKILL.md" in /Users/antemo/studyloop
 succeeded in 0ms:

**Overview 平铺的骨架**（每屏独立一台 IosFrame 并排）：

```jsx
<div style={{display: 'flex', gap: 32, flexWrap: 'wrap', padding: 48, alignItems: 'flex-start'}}>
  {screens.map(s => (
    <div key={s.id}>
      <div style={{fontSize: 13, color: '#666', marginBottom: 8, fontStyle: 'italic'}}>{s.label}</div>
      <IosFrame>
        <ScreenComponent data={s} />
      </IosFrame>
    </div>
  ))}
</div>
```

**Flow demo 的骨架**（单台 clickable 状态机）：

```jsx
function AppPhone({ initial = 'today' }) {
  const [screen, setScreen] = React.useState(initial);
  const [modal, setModal] = React.useState(null);
  // 根据 screen 渲染不同 ScreenComponent，传入 onEnter/onClose/onTabChange/onOpen props
}
```

Screen 组件接 callback props（`onEnter`、`onClose`、`onTabChange`、`onOpen`、`onAnnotation`），不硬编码状态。TabBar、按钮、作品卡加 `cursor: pointer` + hover 反馈。

### 3. 交付前跑真实点击测试

静态截图只能看 layout，交互 bug 要点过才发现。用 Playwright 跑 3 项最小点击测试：进入详情 / 关键标注点 / tab 切换。检查 `pageerror` 为 0 再交付。Playwright 可用 `npx playwright` 调用，或按本机全局安装路径（`npm root -g` + `/playwright`）。

### 4. 品位锚点（pursue list，fallback 首选）

没有 design system 时默认往这些方向走，避免撞 AI slop：

| 维度 | 首选 | 避免 |
|------|------|------|
| **字体** | 衬线 display（Newsreader/Source Serif/EB Garamond）+ `-apple-system` body | 全场 SF Pro 或 Inter——太像系统默认，没风格 |
| **色彩** | 一个有温度的底色 + **单个** accent 贯穿全场（rust 橙/墨绿/深红）| 多色聚类（除非数据真的有 ≥3 个分类维度） |
| **信息密度·克制型**（默认）| 少一层容器、少一个 border、少一个**装饰性** icon——给内容留气口 | 每条卡片都配无意义的 icon + tag + status dot |
| **信息密度·高密度型**（例外）| 当产品核心卖点是「智能 / 数据 / 上下文感知」时（AI 工具、Dashboard、Tracker、Copilot、番茄钟、健康监测、记账类），每屏需**至少 3 处可见的产品差异化信息**：非装饰性数据、对话/推理片段、状态推断、上下文关联 | 只放一个按钮一个时钟——AI 的智能感没表达出来，跟普通 App 没区别 |
| **细节签名** | 留一处「值得截图」的质感：极淡油画底纹 / serif 斜体引语 / 全屏黑底录音波形 | 到处平均用力，结果处处平淡 |

**两条原则同时生效**：
1. 品位 = 一个细节做到 120%，其它做到 80%——不是所有地方都精致，而是在合适的地方足够精致
2. 减法是 fallback，不是普适律——产品核心卖点需要信息密度支撑时（AI / 数据 / 上下文感知类），加法优先于克制。详见下文「信息密度分型」

### 5. iOS 设备框必须用 `assets/ios_frame.jsx`——禁止手写 Dynamic Island / status bar

做 iPhone mockup 时**硬性绑定** `assets/ios_frame.jsx`。这是已经对齐过 iPhone 15 Pro 精确规格的标准外壳：bezel、Dynamic Island（124×36、top:12、居中）、status bar（时间/信号/电池、两侧避让岛、vertical center 对齐岛中线）、Home Indicator、content 区 top padding 都处理好了。

**禁止在你的 HTML 里自己写**以下任何一项：
- `.dynamic-island` / `.island` / `position: absolute; top: 11/12px; width: ~120; 居中的黑圆角矩形`
- `.status-bar` with 手写的时间/信号/电池图标
- `.home-indicator` / 底部 home bar
- iPhone bezel 的圆角外框 + 黑描边 + shadow

自己写 99% 会撞位置 bug——status bar 的时间/电池被岛挤压、或 content top padding 算错导致第一行内容盖在岛下。iPhone 15 Pro 的刘海是**固定 124×36 像素**，留给 status bar 两侧的可用宽度很窄，不是你凭空估的。

**用法（严格三步）**：

```jsx
// 步骤 1: Read 本 skill 的 assets/ios_frame.jsx（相对本 SKILL.md 的路径）
// 步骤 2: 把整个 iosFrameStyles 常量 + IosFrame 组件贴进你的 <script type="text/babel">
// 步骤 3: 你自己的屏组件包在 <IosFrame>...</IosFrame> 里，不碰 island/status bar/home indicator
<IosFrame time="9:41" battery={85}>
  <YourScreen />  {/* 内容从 top 54 开始渲染，下边留给 home indicator，你不用管 */}
</IosFrame>
```

**例外**：只有用户明确要求「假装是 iPhone 14 非 Pro 的刘海」「做 Android 不是 iOS」「自定义设备形态」时才绕过——此时读对应 `android_frame.jsx` 或修改 `ios_frame.jsx` 的常量，**不要**在项目 HTML 里另起一套 island/status bar。

## 工作流程

### 标准流程（用TaskCreate追踪）

1. **理解需求**：
   - 🔍 **0. 事实验证（涉及具体产品/技术时必做，优先级最高）**：任务涉及具体产品/技术/事件（DJI Pocket 4、Gemini 3 Pro、Nano Banana Pro、某新 SDK 等）时，**第一个动作**是 `WebSearch` 验证其存在性、发布状态、最新版本、关键规格。把事实写入 `product-facts.md`。详见「核心原则 #0」。**这步做在问 clarifying questions 之前**——事实错了问什么都歪。
   - 新任务或模糊任务必须问clarifying questions，详见 `references/workflow.md`。一次focused一轮问题通常够，小修小补跳过。
   - 🛑 **检查点1：问题清单一次性发给用户，等用户批量答完再往下走**。不要边问边做。
   - 🛑 **幻灯片/PPT 任务：HTML 聚合演示版永远是默认基础产物**（不管用户最终要什么格式）：
     - **必做**：每页独立 HTML + `assets/deck_index.html` 聚合（重命名为 `index.html`，编辑 MANIFEST 列所有页），浏览器里键盘翻页、全屏演讲——这是幻灯片作品的"源"
     - **可选导出**：额外询问是否需要 PDF（`export_deck_pdf.mjs`）或可编辑 PPTX（`export_deck_pptx.mjs`）作为衍生物
     - **只有要可编辑 PPTX 时**，HTML 必须从第一行就按 4 条硬约束写（见 `references/editable-pptx.md`）；事后补救会 2-3 小时返工
     - **≥ 5 页 deck 必须先做 2 页 showcase 定 grammar 再批量推**（见 `references/slide-decks.md` 的「批量制作前先做 showcase」章节）——跳过这步 = 方向错返工 N 次而非 2 次
     - 详见 `references/slide-decks.md` 开头「HTML 优先架构 + 交付格式决策树」
   - ⚡ **如果用户需求严重模糊（没参考、没明确风格、"做个好看的"类）→ 走「设计方向顾问（Fallback 模式）」大节，完成 Phase 1-4 选定方向后，再回到这里 Step 2**。
2. **探索资源 + 抽核心资产**（不只是抽色值）：读 design system、linked files、上传的截图/代码。**涉及具体品牌时必走 §1.a「核心资产协议」五步**（问→按类型搜→按类型下载 logo/产品图/UI→验证+提取→写 `brand-spec.md` 含所有资产路径）。
   - 🛑 **检查点2·资产自检**：开工前确认核心资产到位——实体产品要有产品图（不是 CSS 剪影）、数字产品要有 logo+UI 截图、色值从真实 HTML/SVG 抽取。缺了就停下补，不硬做。
   - 如果用户没给 context 且挖不出资产，先走设计方向顾问 Fallback，再按 `references/design-context.md` 的品位锚点兜底。
3. **先答四问，再规划系统**：**这一步的前半段比所有 CSS 规则更决定输出**。

   📐 **位置四问**（每个页面/屏幕/镜头开工前必答）：
   - **叙事角色**：hero / 过渡 / 数据 / 引语 / 结尾？（一页 deck 里每页都不一样）
   - **观众距离**：10cm 手机 / 1m 笔记本 / 10m 投屏？（决定字号和信息密度）
   - **视觉温度**：安静 / 兴奋 / 冷静 / 权威 / 温柔 / 悲伤？（决定配色和节奏）
   - **容量估算**：用纸笔画 3 个 5 秒 thumbnail 算一下内容塞得下吗？（防溢出 / 防挤压）

   四问答完再 vocalize 设计系统（色彩/字型/layout 节奏/component pattern）——**系统要服务于答案，不是先选系统再塞内容**。

   🛑 **检查点2：四问答案 + 系统口头说出来等用户点头，再动手写代码**。方向错了晚改比早改贵 100 倍。
4. **构建文件夹结构**：`项目名/` 下放主HTML、需要的assets拷贝（不要bulk copy >20个文件）。
5. **Junior pass**：HTML里写assumptions+placeholders+reasoning comments。
   🛑 **检查点3：尽早show给用户（哪怕只是灰色方块+标签），等反馈再写组件**。
6. **Full pass**：填placeholder，做variations，加Tweaks。做到一半再show一次，不要等全做完。
7. **验证**：用Playwright截图（见 `references/verification.md`），检查控制台错误，发给用户。
   🛑 **检查点4：交付前自己肉眼过一遍浏览器**。AI写的代码经常有interaction bug。
8. **总结**：极简，只说caveats和next steps。
9. **（默认）导出视频 · 必带 SFX + BGM**：动画 HTML 的**默认交付形态是带音频的 MP4**，不是纯画面。无声版本等于半成品——用户潜意识感知「画在动但没声音响应」，廉价感的根源就在这里。流水线：
   - `scripts/render-video.js` 录 25fps 纯画面 MP4（只是中间产物，**不是成品**）
   - `scripts/convert-formats.sh` 派生 60fps MP4 + palette 优化 GIF（视平台需要）
   - `scripts/add-music.sh` 加 BGM（6 首场景化配乐：tech/ad/educational/tutorial + alt 变体）
   - SFX 按 `references/audio-design-rules.md` 设计 cue 清单（时间轴 + 音效类型），用 `assets/sfx/<category>/*.mp3` 37 个预制资源，按配方 A/B/C/D 选密度（发布 hero ≈ 6个/10s，工具演示 ≈ 0-2个/10s）
   - **BGM + SFX 双轨制必须同时做**——只做 BGM 是 ⅓ 分完成度；SFX 占高频、BGM 占低频，频段隔离见 audio-design-rules.md 的 ffmpeg 模板
   - 交付前 `ffprobe -select_streams a` 确认有 audio stream，没有则不是成品
   - **跳过音频的条件**：用户明确说「不要音频」「纯画面」「我要自己配音」——否则默认带。
   - 参考完整流程见 `references/video-export.md` + `references/audio-design-rules.md` + `references/sfx-library.md`。
10. **（可选）专家评审**：用户若提「评审」「好不好看」「review」「打分」，或你对产出有疑问想主动质检，按 `references/critique-guide.md` 走 5 维度评审——哲学一致性 / 视觉层级 / 细节执行 / 功能性 / 创新性各 0-10 分，输出总评 + Keep（做得好的）+ Fix（严重程度 ⚠️致命 / ⚡重要 / 💡优化）+ Quick Wins（5 分钟能做的前 3 件事）。评审设计不评设计师。

**检查点原则**：碰到🛑就停下，明确告诉用户"我做了X，下一步打算Y，你确认吗？"然后真的**等**。不要说完自己就开始做。

### 问问题的要点

必问（用`references/workflow.md`里的模板）：
- design system/UI kit/codebase有吗？没有的话先去找
- 想要几种variations？在哪些维度上变？
- 关心flow、copy、还是visuals？
- 希望Tweak什么？

## 异常处理

流程假设用户配合、环境正常。实操常遇以下异常，预定义fallback：

| 场景 | 触发条件 | 处理动作 |
|------|---------|---------|
| 需求模糊到无法着手 | 用户只给一句模糊描述（如"做个好看的页面"） | 主动列3个可能方向让用户选（如"落地页 / Dashboard / 产品详情页"），而不是直接问10个问题 |
| 用户拒绝回答问题清单 | 用户说"不要问了，直接做" | 尊重节奏，用best judgment做1个主方案+1个差异明显的变体，交付时**明确标注assumption**，方便用户定位要改哪里 |
| Design context矛盾 | 用户给的参考图和品牌规范打架 | 停下，指出具体矛盾（"截图里字体是衬线，规范说用sans"），让用户选一个 |
| Starter component加载失败 | 控制台404/integrity mismatch | 先查`references/react-setup.md`常见报错表；还不行降级纯HTML+CSS不用React，保证产出可用 |
| 时间紧迫要快交付 | 用户说"30分钟内要" | 跳过Junior pass直接Full pass，只做1个方案，交付时**明确标注"未经early validation"**，提醒用户质量可能打折 |
| SKILL.md体积超限 | 新写HTML>1000行 | 按`references/react-setup.md`的拆分策略拆成多jsx文件，末尾`Object.assign(window,...)`共享 |
| 克制原则 vs 产品所需密度冲突 | 产品核心卖点是 AI 智能 / 数据可视化 / 上下文感知（如番茄钟、Dashboard、Tracker、AI agent、Copilot、记账、健康监测）| 按「品位锚点」表格走**高密度型**信息密度：每屏 ≥ 3 处产品差异化信息。装饰性 icon 照样忌讳——加的是**有内容的**密度，不是装饰 |

**原则**：异常时**先告诉用户发生了什么**（1句话），再按表处理。不要静默决策。

## 反AI slop速查

| 类别 | 避免 | 采用 |
|------|------|------|
| 字体 | Inter/Roboto/Arial/系统字体 | 有特点的display+body配对 |
| 色彩 | 紫色渐变、凭空新颜色 | 品牌色/oklch定义的和谐色 |
| 容器 | 圆角+左border accent | 诚实的边界/分隔 |
| 图像 | SVG画人画物 | 真实素材或placeholder |
| 图标 | **装饰性** icon 每处都配（撞 slop）| **承载差异化信息**的密度元素必须保留——不要把产品特色也一并减掉 |
| 填充 | 编造stats/quotes装饰 | 留白，或问用户要真内容 |
| 动画 | 散落的微交互 | 一次well-orchestrated的page load |
| 动画-伪chrome | 画面内画底部进度条/时间码/版权署名条（与 Stage scrubber 撞车） | 画面只放叙事内容，进度/时间交给 Stage chrome（详见 `references/animation-pitfalls.md` §11） |

## 技术红线（必读 references/react-setup.md）

**React+Babel项目**必须用pinned版本（见`react-setup.md`）。三条不可违反：

1. **never** 写 `const styles = {...}`——多组件时命名冲突会炸。**必须**给唯一名字：`const terminalStyles = {...}`
2. **scope不共享**：多个`<script type="text/babel">`之间组件不通，必须用`Object.assign(window, {...})`导出
3. **never** 用 `scrollIntoView`——会搞坏容器滚动，用其他DOM scroll方法

**固定尺寸内容**（幻灯片/视频）必须自己实现JS缩放，用auto-scale + letterboxing。

**幻灯片架构选型（必先决定）**：
- **多文件**（默认，≥10页 / 学术/课件 / 多agent并行）→ 每页独立HTML + `assets/deck_index.html`拼接器
- **单文件**（≤10页 / pitch deck / 需跨页共享状态）→ `assets/deck_stage.js` web component

先读 `references/slide-decks.md` 的「🛑 先定架构」一节，错了会反复踩 CSS 特异性/作用域的坑。

## Starter Components（assets/下）

造好的起手组件，直接copy进项目使用：

| 文件 | 何时用 | 提供 |
|------|--------|------|
| `deck_index.html` | **幻灯片的默认基础产物**（不管最终出 PDF 还是 PPTX，HTML 聚合版永远先做） | iframe拼接 + 键盘导航 + scale + 计数器 + 打印合并，每页独立HTML免CSS串扰。用法：复制为 `index.html`、编辑 MANIFEST 列出所有页、浏览器打开即成演示版 |
| `deck_stage.js` | 做幻灯片（单文件架构，≤10页） | web component：auto-scale + 键盘导航 + slide counter + localStorage + speaker notes ⚠️ **script 必须放在 `</deck-stage>` 之后，section 的 `display: flex` 必须写到 `.active` 上**，详见 `references/slide-decks.md` 的两个硬约束 |
| `scripts/export_deck_pdf.mjs` | **HTML→PDF 导出（多文件架构）** · 每页独立 HTML 文件，playwright 逐个 `page.pdf()` → pdf-lib 合并。文字保留矢量可搜。依赖 `playwright pdf-lib` |
| `scripts/export_deck_stage_pdf.mjs` | **HTML→PDF 导出（单文件 deck-stage 架构专用）** · 2026-04-20 新增。处理 shadow DOM slot 导致的「只出 1 页」、absolute 子元素溢出等坑。详见 `references/slide-decks.md` 末节。依赖 `playwright` |
| `scripts/export_deck_pptx.mjs` | **HTML→可编辑 PPTX 导出** · 调 `html2pptx.js` 导出原生可编辑文本框，文字在 PPT 里双击可直接编辑。**HTML 必须符合 4 条硬约束**（见 `references/editable-pptx.md`），视觉自由度优先的场景请改走 PDF 路径。依赖 `playwright pptxgenjs sharp` |
| `scripts/html2pptx.js` | **HTML→PPTX 元素级翻译器** · 读 computedStyle 把 DOM 逐元素翻译成 PowerPoint 对象（text frame / shape / picture）。`export_deck_pptx.mjs` 内部调用。要求 HTML 严格满足 4 条硬约束 |
| `design_canvas.jsx` | 并排展示≥2个静态variations | 带label的网格布局 |
| `animations.jsx` | 任何动画HTML | Stage + Sprite + useTime + Easing + interpolate |
| `ios_frame.jsx` | iOS App mockup | iPhone bezel + 状态栏 + 圆角 |
| `android_frame.jsx` | Android App mockup | 设备bezel |
| `macos_window.jsx` | 桌面App mockup | 窗口chrome + 红绿灯 |
| `browser_window.jsx` | 网页在浏览器里的样子 | URL bar + tab bar |

用法：读取对应 assets 文件内容 → inline 进你的 HTML `<script>` 标签 → slot 进你的设计。

## References路由表

根据任务类型深入读对应references：

| 任务 | 读 |
|------|-----|
| 开工前问问题、定方向 | `references/workflow.md` |
| 反AI slop、内容规范、scale | `references/content-guidelines.md` |
| React+Babel项目setup | `references/react-setup.md` |
| 做幻灯片 | `references/slide-decks.md` + `assets/deck_stage.js` |
| 导出可编辑 PPTX（html2pptx 4 条硬约束） | `references/editable-pptx.md` + `scripts/html2pptx.js` |
| 做动画/motion（**先读 pitfalls**）| `references/animation-pitfalls.md` + `references/animations.md` + `assets/animations.jsx` |
| **动画的正向设计语法**（Anthropic 级叙事/运动/节奏/表达风格）| `references/animation-best-practices.md`（5 段叙事+Expo easing+运动语言 8 条+3 种场景配方）|
| 做Tweaks实时调参 | `references/tweaks-system.md` |
| 没有design context怎么办 | `references/design-context.md`（薄 fallback） 或 `references/design-styles.md`（厚 fallback：20 种设计哲学详细库） |
| **需求模糊要推荐风格方向** | `references/design-styles.md`（20 种风格+AI prompt 模板）+ `assets/showcases/INDEX.md`（24 个预制样例） |
| **按输出类型查场景模板**（封面/PPT/信息图） | `references/scene-templates.md` |
| 输出完后验证 | `references/verification.md` + `scripts/verify.py` |
| **设计评审/打分**（设计完成后可选） | `references/critique-guide.md`（5 维度评分+常见问题清单） |
| **动画导出MP4/GIF/加BGM** | `references/video-export.md` + `scripts/render-video.js` + `scripts/convert-formats.sh` + `scripts/add-music.sh` |
| **动画加音效SFX**（苹果发布会级，37个预制） | `references/sfx-library.md` + `assets/sfx/<category>/*.mp3` |
| **动画音频配置规则**（SFX+BGM双轨制、黄金配比、ffmpeg模板、场景配方） | `references/audio-design-rules.md` |
| **Apple画廊展示风格**（3D倾斜+悬浮卡片+缓慢pan+焦点切换，v9实战同款） | `references/apple-gallery-showcase.md` |
| **Gallery Ripple + Multi-Focus 场景哲学**（当素材 20+ 同质+场景需表达「规模×深度」时优先用；含前置条件、技术配方、5 个可复用模式）| `references/hero-animation-case-study.md`（huashu-design hero v9 蒸馏）|

## 跨 Agent 环境适配说明

本 skill 设计为 **agent-agnostic**——Claude Code、Codex、Cursor、Trae、OpenClaw、Hermes Agent 或任何支持 markdown-based skill 的 agent 都可以使用。以下是和原生「设计型 IDE」（如 Claude.ai Artifacts）对比时的通用差异处理方式：

- **没有内置的 fork-verifier agent**：用 `scripts/verify.py`（Playwright 封装）人工驱动验证
- **没有 asset 注册到 review pane**：直接用 agent 的 Write 能力写文件，用户在自己的浏览器/IDE 里打开
- **没有 Tweaks host postMessage**：改成**纯前端 localStorage 版**，详见 `references/tweaks-system.md`
- **没有 `window.claude.complete` 免配置 helper**：若 HTML 里要调 LLM，用一个可复用的 mock 或让用户填自己的 API key，详见 `references/react-setup.md`
- **没有结构化问题 UI**：在对话里用 markdown 清单问问题，参考 `references/workflow.md` 的模板

Skill 路径引用均采用**相对本 skill 根目录**的形式（`references/xxx.md`、`assets/xxx.jsx`、`scripts/xxx.sh`）——agent 或用户按自身安装位置解析，不依赖任何绝对路径。

## 产出要求

- HTML文件命名描述性：`Landing Page.html`、`iOS Onboarding v2.html`
- 大改版时copy一份旧版保留：`My Design.html` → `My Design v2.html`
- 避免>1000行的大文件，拆成多个JSX文件import进主文件
- 幻灯片、动画等固定尺寸内容，**播放位置**存localStorage——刷新不丢
- HTML放项目目录，不要散落到`~/Downloads`
- 最终产出用浏览器打开检查或用Playwright截图

## Skill 推广水印（仅动画产出）

**只在动画产出**（HTML 动画 → MP4 / GIF）默认带「**Created by Huashu-Design**」水印，辅助 skill 传播。**幻灯片 / 信息图 / 原型 / 网页等其他场景不加**——加了反而干扰用户实际使用。

- **必带场景**：HTML 动画 → 导出 MP4 / GIF（用户会拿去公众号、X、B站传播，水印能跟着流通）
- **不带场景**：幻灯片（用户自己讲）、信息图（嵌文章）、App / 网页原型（设计 review）、配图
- **第三方品牌的非官方致敬动画**：水印前加「非官方出品 · 」前缀，避免被误认为官方物料引发 IP 争议
- **用户明确说"不要水印"**：尊重，移除
- **水印模板**：
  ```jsx
  <div style={{
    position: 'absolute', bottom: 24, right: 32,
    fontSize: 11, color: 'rgba(0,0,0,0.4)' /* 深底用 rgba(255,255,255,0.35) */,
    letterSpacing: '0.15em', fontFamily: 'monospace',
    pointerEvents: 'none', zIndex: 100,
  }}>
    Created by Huashu-Design
    {/* 第三方品牌动画前缀「非官方出品 · 」*/}
  </div>
  ```

## 核心提醒

- **事实验证先于假设**（核心原则 #0）：涉及具体产品/技术/事件（DJI Pocket 4、Gemini 3 Pro 等）必须先 `WebSearch` 验证存在性和状态，不凭训练语料断言。
- **Embody专家**：做幻灯片时是幻灯片设计师，做动画时是动画师。不是写Web UI。
- **Junior先show，再做**：先展示思路，再执行。
- **Variations不给答案**：3+个变体，让用户选。
- **Placeholder优于烂实现**：诚实留白，不编造。
- **反AI slop时时警醒**：每个渐变/emoji/圆角border accent之前先问——这真的必要吗？
- **涉及具体品牌**：走「核心资产协议」（§1.a）——Logo（必需）+ 产品图（实体产品必需）+ UI 截图（数字产品必需），色值只是辅助。**不要用 CSS 剪影代替真实产品图**。
- **做动画之前**：必读 `references/animation-pitfalls.md`——里面 14 条规则每条都来自真实踩过的坑，跳过会让你重做 1-3 轮。
- **手写 Stage / Sprite**（不用 `assets/animations.jsx`）：必须实现两件事——(a) tick 第一帧同步设 `window.__ready = true` (b) 检测 `window.__recording === true` 时强制 loop=false。否则录视频必出问题。

codex
The review skill routes this task through its five-dimension critique rubric. I’m applying that rubric, but I’ll report in your requested acceptance/P0–P2/regression format rather than its generic scorecard.
exec
/bin/zsh -lc "sed -n '1,280p' /Users/antemo/.agents/skills/huashu-design/references/critique-guide.md && printf '\\nFILES\\n' && rg --files design web/src | sort && printf '\\nSPEC\\n' && sed -n '1,320p' design/DESIGN.md" in /Users/antemo/studyloop
 succeeded in 0ms:
# 设计评审深度指南

> Phase 7 的详细参考。提供评分标准、场景侧重点、常见问题清单。

---

## 评分标准详解

### 1. 哲学一致性（Philosophy Alignment）

| 分数 | 标准 |
|------|------|
| 9-10 | 设计完美体现了选定哲学的核心精神，每个细节都有哲学依据 |
| 7-8 | 整体方向正确，核心特征到位，个别细节偏离 |
| 5-6 | 能看出意图，但执行时混入了其他风格元素，不够纯粹 |
| 3-4 | 仅在表面模仿，未理解哲学内核 |
| 1-2 | 与选定哲学基本无关 |

**评审要点**：
- 是否使用了该设计师/机构的标志性手法？
- 色彩、字体、布局是否符合该哲学体系？
- 有没有「自相矛盾」的元素？（如选了Kenya Hara却塞满内容）

### 2. 视觉层级（Visual Hierarchy）

| 分数 | 标准 |
|------|------|
| 9-10 | 用户视线自然沿设计者意图流动，信息获取零摩擦 |
| 7-8 | 主次关系清晰，偶有1-2处层级模糊 |
| 5-6 | 能分出标题和正文，但中间层级混乱 |
| 3-4 | 信息平铺，没有明确的视觉入口 |
| 1-2 | 混乱，用户不知道先看哪里 |

**评审要点**：
- 标题与正文的字号对比是否足够？（至少2.5倍）
- 颜色/粗细/大小是否建立了3-4个清晰层级？
- 留白是否在引导视线？
- 「眯眼测试」：眯起眼看，层级是否仍然清晰？

### 3. 细节执行（Craft Quality）

| 分数 | 标准 |
|------|------|
| 9-10 | 像素级精确，对齐、间距、颜色无任何瑕疵 |
| 7-8 | 整体精致，有1-2处微小对齐/间距问题 |
| 5-6 | 基本对齐，但间距不统一，颜色使用不够系统 |
| 3-4 | 明显的对齐错误、间距混乱、颜色过多 |
| 1-2 | 粗糙，看起来像草稿 |

**评审要点**：
- 是否使用了统一的间距系统（如8pt网格）？
- 同类元素的间距是否一致？
- 颜色数量是否受控？（通常不超过3-4种）
- 字体家族是否统一？（通常不超过2种）
- 边缘对齐是否精确？

### 4. 功能性（Functionality）

| 分数 | 标准 |
|------|------|
| 9-10 | 每个设计元素都服务于目标，零冗余 |
| 7-8 | 功能导向明确，有少量可删减的装饰 |
| 5-6 | 基本可用，但有明显的装饰性元素分散注意力 |
| 3-4 | 形式大于功能，用户需要努力寻找信息 |
| 1-2 | 完全被装饰淹没，失去了传达信息的能力 |

**评审要点**：
- 删掉任何一个元素，设计会变差吗？（如果不会，就应该删）
- CTA/关键信息是否在最显眼的位置？
- 是否有「因为好看所以加上去」的元素？
- 信息密度与载体是否匹配？（PPT不宜太密，PDF可以更密）

### 5. 创新性（Originality）

| 分数 | 标准 |
|------|------|
| 9-10 | 令人耳目一新，在该哲学框架内找到了独特表达 |
| 7-8 | 有自己的想法，不是简单的模板套用 |
| 5-6 | 中规中矩，看起来像模板 |
| 3-4 | 大量使用了cliché（如渐变圆球代表AI） |
| 1-2 | 完全是模板或素材拼凑 |

**评审要点**：
- 是否避免了常见cliché？（见下方「常见问题清单」）
- 在遵循设计哲学的同时是否有个人表达？
- 是否有「意想不到但很合理」的设计决策？

---

## 场景评审侧重

不同输出类型的评审重点不同：

| 场景 | 最重要维度 | 次重要 | 可放宽 |
|------|-----------|--------|--------|
| 公众号封面/配图 | 创新性、视觉层级 | 哲学一致性 | 功能性（单图不涉及交互） |
| 信息图 | 功能性、视觉层级 | 细节执行 | 创新性（准确优先） |
| PPT/Keynote | 视觉层级、功能性 | 细节执行 | 创新性（清晰优先） |
| PDF/白皮书 | 细节执行、功能性 | 视觉层级 | 创新性（专业优先） |
| 落地页/官网 | 功能性、视觉层级 | 创新性 | —（全面要求） |
| App UI | 功能性、细节执行 | 视觉层级 | 哲学一致性（可用性优先） |
| 小红书配图 | 创新性、视觉层级 | 哲学一致性 | 细节执行（氛围优先） |

---

## 常见设计问题 Top 10

### 1. AI科技cliché
**问题**：渐变圆球、数字雨、蓝色电路板、机器人脸
**为什么是问题**：用户已经对这些视觉疲劳，无法区分你和其他人
**修复**：用抽象隐喻替代直白符号（如用「对话」的隐喻而非聊天气泡图标）

### 2. 字号层级不足
**问题**：标题和正文差距太小（<2.5倍）
**为什么是问题**：用户无法快速定位关键信息
**修复**：标题至少为正文的3倍（如正文16px → 标题48-64px）

### 3. 颜色过多
**问题**：使用5种以上颜色，没有主次
**为什么是问题**：视觉混乱，品牌感弱
**修复**：限制为1个主色+1个辅色+1个强调色+灰阶

### 4. 间距不统一
**问题**：元素间距随意，没有系统
**为什么是问题**：看起来不专业，视觉节奏混乱
**修复**：建立8pt网格系统（间距只用8/16/24/32/48/64px）

### 5. 留白不足
**问题**：所有空间都被内容填满
**为什么是问题**：信息拥挤导致阅读疲劳，反而降低信息传达效率
**修复**：留白至少占总面积40%（极简风格60%+）

### 6. 字体过多
**问题**：使用3种以上字体
**为什么是问题**：视觉噪音，削弱统一感
**修复**：最多2种字体（1种标题+1种正文），用字重和大小创造变化

### 7. 对齐不一致
**问题**：有的左对齐，有的居中，有的右对齐
**为什么是问题**：破坏视觉秩序感
**修复**：选定一种对齐方式（推荐左对齐），全局统一

### 8. 装饰大于内容
**问题**：背景图案/渐变/阴影抢了主要内容的风头
**为什么是问题**：本末倒置，用户来看信息不是看装饰
**修复**：「如果删掉这个装饰，设计会变差吗？」如果不会，就删

### 9. 赛博霓虹滥用
**问题**：深蓝底(#0D1117) + 霓虹色发光效果
**为什么是问题**：默认审美禁区（本 skill 的品位基线），且已成为最大 cliché 之一——用户可按自己品牌 override
**修复**：选择更有辨识度的配色方案（参考20种风格的色彩系统）

### 10. 信息密度与载体不匹配
**问题**：PPT里放了一整页文字 / 封面图里塞了10个元素
**为什么是问题**：不同载体的最佳信息密度不同
**修复**：
- PPT：每页1个核心观点
- 封面图：1个视觉焦点
- 信息图：分层展示
- PDF：可以更密，但需要清晰的导航

---

## 评审输出模板

```
## 设计评审报告

**总体评分**：X.X/10 [优秀(8+)/良好(6-7.9)/需改进(4-5.9)/不合格(<4)]

**分项评分**：
- 哲学一致性：X/10 [一句话说明]
- 视觉层级：X/10 [一句话说明]
- 细节执行：X/10 [一句话说明]
- 功能性：X/10 [一句话说明]
- 创新性：X/10 [一句话说明]

### 优点（Keep）
- [具体指出做得好的地方，用设计语言描述]

### 问题（Fix）
[按严重程度排序]

**1. [问题名称]** — ⚠️致命 / ⚡重要 / 💡优化
- 当前：[描述现状]
- 问题：[为什么这是问题]
- 修复：[具体操作，含数值]

### 快速修复清单（Quick Wins）
如果只有5分钟，优先做这3件事：
- [ ] [最有影响力的修复]
- [ ] [第二重要的修复]
- [ ] [第三重要的修复]
```

---

**版本**：v1.0
**更新日期**：2026-02-13

FILES
design/DESIGN-BRIEF.md
design/DESIGN.md
design/design-spec-codex.md
design/design-spec-kimi.md
design/reference-youtube.png
design/v2-a-home.png
design/v2-a-watch.png
design/v2-b-upnext.png
design/v2-c-analysis.png
design/v2-d-home.png
design/v2-d-modal.png
design/v2-d-rail.png
design/v2-d-watch.png
web/src/App.tsx
web/src/components/ToastHost.module.css
web/src/components/ToastHost.tsx
web/src/components/TopBar.module.css
web/src/components/TopBar.tsx
web/src/components/icons.tsx
web/src/concepts/AnalysisSections.module.css
web/src/concepts/AnalysisSections.tsx
web/src/concepts/ConceptCard.module.css
web/src/concepts/ConceptCard.tsx
web/src/concepts/ConceptOverlay.module.css
web/src/concepts/ConceptOverlay.tsx
web/src/concepts/ConceptTicker.module.css
web/src/concepts/ConceptTicker.tsx
web/src/concepts/ConceptsDock.module.css
web/src/concepts/ConceptsDock.tsx
web/src/css-modules.d.ts
web/src/index.css
web/src/lib/analysisFormat.test.ts
web/src/lib/analysisFormat.ts
web/src/lib/api.ts
web/src/lib/compileFlow.test.ts
web/src/lib/compileFlow.ts
web/src/lib/conceptFormat.test.ts
web/src/lib/conceptFormat.ts
web/src/lib/heatmap.test.ts
web/src/lib/heatmap.ts
web/src/lib/hotkeys.ts
web/src/lib/markdownLite.test.ts
web/src/lib/markdownLite.ts
web/src/lib/notesFormat.test.ts
web/src/lib/notesFormat.ts
web/src/lib/router.ts
web/src/lib/selectors.test.ts
web/src/lib/selectors.ts
web/src/lib/time.test.ts
web/src/lib/time.ts
web/src/lib/types.ts
web/src/library/LibraryView.module.css
web/src/library/LibraryView.tsx
web/src/library/SettingsView.module.css
web/src/library/SettingsView.tsx
web/src/main.tsx
web/src/notes/BubbleRail.module.css
web/src/notes/BubbleRail.tsx
web/src/notes/NotationModal.module.css
web/src/notes/NotationModal.tsx
web/src/notes/NotesPane.module.css
web/src/notes/NotesPane.tsx
web/src/player/CCOverlay.module.css
web/src/player/CCOverlay.tsx
web/src/player/HeatmapStrip.module.css
web/src/player/HeatmapStrip.tsx
web/src/player/LocalVideoPlayer.module.css
web/src/player/LocalVideoPlayer.tsx
web/src/player/PlayerChrome.module.css
web/src/player/PlayerChrome.tsx
web/src/player/PlayerControls.module.css
web/src/player/PlayerControls.tsx
web/src/player/SeekBar.module.css
web/src/player/SeekBar.tsx
web/src/player/YouTubePlayer.module.css
web/src/player/YouTubePlayer.tsx
web/src/player/types.ts
web/src/player/youtubeApi.ts
web/src/state/store.test.ts
web/src/state/store.ts
web/src/study/AnalyzeButton.module.css
web/src/study/AnalyzeButton.tsx
web/src/study/BottomDock.module.css
web/src/study/BottomDock.tsx
web/src/study/CompileFlow.module.css
web/src/study/CompileFlow.tsx
web/src/study/ImportOverlayFlow.tsx
web/src/study/MarkdownPreview.module.css
web/src/study/MarkdownPreview.tsx
web/src/study/OverlaysToggle.module.css
web/src/study/OverlaysToggle.tsx
web/src/study/RightRail.module.css
web/src/study/RightRail.tsx
web/src/study/ShareFlow.tsx
web/src/study/StudyView.module.css
web/src/study/StudyView.tsx
web/src/transcript/TranscriptPane.module.css
web/src/transcript/TranscriptPane.tsx

SPEC
# StudyLoop Design System — ADJUDICATED SPEC (binding)

Two consultant specs were produced independently and cross-validate heavily:
- `design/design-spec-codex.md` (codex — complete: tokens, icons, typography,
  interaction, per-component polish, motion, priority plan, acceptance criteria)
- `design/design-spec-kimi.md` (kimi — tokens, full icon inventory WITH ready
  SVG path data, state-overlay model, micro-interactions, typography; truncated
  after §4)

## Adjudication (what to implement)

**Backbone: follow `design-spec-codex.md` end-to-end** — its §1 foundation
tokens, §2 icon system component API, §3 typography, §4 interaction system,
§5 component polish (ALL P0s + P1s; P2s optional), §6 motion, §7 priority plan,
and its acceptance criteria are the deliverable.

**Kimi overrides/additions to fold in:**
1. **Icon path data**: use kimi's §2 hand-rolled `<symbol>` path data as the
   starting set (Material-style, Apache-2.0 heritage — add an attribution line in
   README). Wrap in codex's `<Icon name size />` React component API (no sprite
   in index.html; a single `icons.tsx` module exporting path data + component,
   tree-shaken). Any icon codex needs that kimi's table lacks: hand-roll in the
   same 24px grid style.
2. **State overlays**: adopt kimi's `--hover-overlay / --active-overlay /
   --pressed-overlay` tokens; implement hover/pressed states as overlay
   compositing (`background: color-mix(...)` or layered pseudo-element) rather
   than per-component hardcoded hover colors — codex's per-component hover
   values become fallbacks only where overlays don't fit.
3. **Spring easing**: add kimi's `--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1)`
   and use it for the concept-ticker slide-in and toast entrance only (subtle
   overshoot; everything else uses codex's standard/decel curves).
4. **Global focus-visible rule + reduced-motion block**: kimi's §1 versions
   (they're global and simpler); codex's per-component focus notes still apply
   where they add specificity.

**Conflict resolutions:**
- Surface stack: codex's (finer: bg #0f0f0f · raised #181818 · overlay #212121 ·
  popover #282828 · hover #3f3f3f) — kimi's coarser stack maps onto it.
- Shadows: codex's shadow-1..3 + shadow-player (includes hairline ring — reads
  more premium on pure-dark).
- Scrollbars: codex's 8px auto-hiding variant.
- Duration tokens: codex's names (press/fast/standard/panel/modal).

**Hard rules (owner directive):**
- ZERO emoji glyphs anywhere in the UI after this pass (includes toasts, empty
  states, titles, tooltips). Text labels keep sentence case.
- Every interactive element must have distinct hover, active/pressed, and
  focus-visible states with tokenized transitions.
- No external fonts, CDNs, or icon fonts — CSP-strict, offline-first.
- The video player stays visually dominant; chrome never competes with content.
- `prefers-reduced-motion` fully honored.

exec
/bin/zsh -lc "rg -n \"Acceptance|acceptance|P0|P1|P2|## 7|## 8|###\" design/design-spec-codex.md | tail -120 && sed -n '1,260p' web/src/index.css && git show --stat --oneline 8b339d5 && git show --format=fuller --no-ext-diff --stat 8b339d5" in /Users/antemo/studyloop
 succeeded in 0ms:
7:### P0 — Replace the current root variables
109:### P0 — Global focus and disabled states
142:### P0 — Add a local inline-SVG icon layer
213:### P0 — Replace every current glyph
265:### P0 — Establish one explicit scale
313:### P0 — Shared state behavior
342:### P1 — Lightweight ripple
376:### State specifics
393:### Player chrome — P0
424:### Seek bar and heatmap — P0
508:### Right rail — P0
551:### Notation modal — P0
589:### Compile and import/share modals — P0
602:### Concept ticker — P1
619:### Bubble rail — P1
648:### Library cards and empty states — P1
659:### Toasts — P1
682:### Loading skeletons — P1
710:### Custom scrollbars — P0
749:### P0 — Required motion
793:### P0 — Reduced motion
817:## 7. Priority plan
819:### P0 — Defines the premium feel
831:### P1 — Strong quality gains
842:### P2 — Nice refinements
851:## Acceptance criteria
:root {
  color-scheme: dark;

  /* Surfaces (SPEC V2 "Player chrome" / codex §1 — finer 5-step stack) */
  --surface-bg: #0f0f0f;
  --surface-player: #000;
  --surface-raised: #181818;
  --surface-overlay: #212121;
  --surface-popover: #282828;
  --surface-hover: #3f3f3f;
  --surface-pressed: #4a4a4a;
  --surface-scrim: rgb(0 0 0 / 72%);
  --surface-input: #121212;

  /* State overlays (kimi) — compositing tint applied over any surface */
  --hover-overlay: rgb(255 255 255 / 8%);
  --active-overlay: rgb(255 255 255 / 16%);
  --pressed-overlay: rgb(255 255 255 / 24%);

  /* Borders */
  --border-hairline: rgb(255 255 255 / 8%);
  --border-subtle: #303030;
  --border-default: #3f3f3f;
  --border-strong: #525252;

  /* Text */
  --text-primary: #f1f1f1;
  --text-secondary: #aaa;
  --text-tertiary: #717171;
  --text-disabled: rgb(241 241 241 / 38%);

  /* Semantic */
  --accent-blue: #3ea6ff;
  --accent-red: #ff0033;
  --accent-green: #4bb779;
  --accent-amber: #e0a83e;
  --danger: #ff5c5c;

  /* Elevation (codex — includes hairline ring, reads premium on pure dark) */
  --shadow-1:
    0 1px 2px rgb(0 0 0 / 42%),
    0 0 0 1px rgb(255 255 255 / 2%);
  --shadow-2:
    0 4px 12px rgb(0 0 0 / 46%),
    0 1px 2px rgb(0 0 0 / 36%);
  --shadow-3:
    0 12px 32px rgb(0 0 0 / 58%),
    0 2px 8px rgb(0 0 0 / 32%);
  --shadow-player:
    0 8px 28px rgb(0 0 0 / 42%);

  /* Geometry */
  --radius-xs: 4px;
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-pill: 999px;

  /* Motion (codex naming; kimi's --ease-spring folded in for ticker/toast entry) */
  --duration-press: 70ms;
  --duration-fast: 120ms;
  --duration-standard: 180ms;
  --duration-panel: 240ms;
  --duration-modal: 280ms;

  --ease-standard: cubic-bezier(.2, 0, 0, 1);
  --ease-enter: cubic-bezier(0, 0, .2, 1);
  --ease-exit: cubic-bezier(.4, 0, 1, 1);
  --ease-spring: cubic-bezier(.34, 1.56, .64, 1);

  /* Focus */
  --focus-ring:
    0 0 0 2px var(--surface-bg),
    0 0 0 4px var(--accent-blue);

  /* Typography */
  --font-sans: "Roboto", "Arial", -apple-system, BlinkMacSystemFont,
    "Segoe UI", sans-serif;
  --font-mono: "SFMono-Regular", Consolas, "Liberation Mono", monospace;

  --type-11: 11px;
  --type-12: 12px;
  --type-13: 13px;
  --type-14: 14px;
  --type-16: 16px;
  --type-18: 18px;
  --type-20: 20px;

  --weight-regular: 400;
  --weight-medium: 500;
  --weight-bold: 700;

  --topbar-height: 56px;

  /* Temporary compatibility aliases during token migration — do not add new
     usages, prefer the canonical names above. */
  --bg: var(--surface-bg);
  --bg-elevated: var(--surface-overlay);
  --bg-chip: var(--surface-popover);
  --bg-hover: var(--surface-hover);
  --border: var(--border-default);
  --text: var(--text-primary);
  --text-dim: var(--text-secondary);
  --accent: var(--accent-blue);
  --accent-contrast: var(--surface-bg);
  --success: var(--accent-green);
  --warn: var(--accent-amber);
  --red: var(--accent-red);
  --radius-card: var(--radius-md);
}

* {
  box-sizing: border-box;
}

html,
body,
#root {
  min-height: 100%;
}

body {
  margin: 0;
  background: var(--surface-bg);
  color: var(--text-primary);
  font-family: var(--font-sans);
  font-size: var(--type-14);
  -webkit-font-smoothing: antialiased;
}

button,
input,
textarea,
select {
  font-family: inherit;
}

button {
  font-family: inherit;
}

::selection {
  background: color-mix(in srgb, var(--accent-blue) 35%, transparent);
}

time,
.tabular-nums {
  font-variant-numeric: tabular-nums;
}

/* Global focus-visible ring (kimi §1 — global + simpler; per-component focus
   notes elsewhere still add specificity where needed). */
:where(
  button,
  input,
  textarea,
  select,
  [role="button"],
  [role="slider"],
  [role="tab"],
  [tabindex]
):focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

:where(button, [role="button"]):disabled {
  color: var(--text-disabled);
  cursor: default;
}

:where(button, [role="button"]) {
  -webkit-tap-highlight-color: transparent;
}

/* Custom scrollbars — codex §5, 8px auto-hiding variant */
* {
  scrollbar-width: thin;
  scrollbar-color: #606060 transparent;
}

::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  min-height: 32px;
  border: 2px solid transparent;
  border-radius: 999px;
  background: #606060;
  background-clip: padding-box;
}

::-webkit-scrollbar-thumb:hover {
  background: #8a8a8a;
  background-clip: padding-box;
}

/* Shared micro-interaction primitives (codex §4) */
.interactive {
  transition:
    color var(--duration-fast) var(--ease-standard),
    background-color var(--duration-fast) var(--ease-standard),
    border-color var(--duration-fast) var(--ease-standard),
    opacity var(--duration-fast) var(--ease-standard),
    transform var(--duration-press) var(--ease-standard),
    box-shadow var(--duration-fast) var(--ease-standard);
}

.interactive:active:not(:disabled) {
  transform: scale(.96);
}

/* Lightweight centered ripple (codex §4 P1) */
button[data-ripple] {
  position: relative;
  isolation: isolate;
  overflow: hidden;
}

button[data-ripple]::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  background: radial-gradient(circle, currentColor 0 10%, transparent 11%);
  opacity: 0;
  transform: scale(.25);
  transition:
    transform 260ms var(--ease-enter),
    opacity 180ms var(--ease-exit);
}

button[data-ripple]:active::after {
  opacity: .13;
  transform: scale(3);
  transition-duration: 0ms;
}

/* Reusable skeleton shimmer */
.skeleton {
  border-radius: var(--radius-xs);
  background: linear-gradient(
    90deg,
    rgb(255 255 255 / 5%) 20%,
    rgb(255 255 255 / 10%) 38%,
    rgb(255 255 255 / 5%) 56%
  );
  background-size: 220% 100%;
  animation: skeleton-shimmer 1.4s linear infinite;
}

@keyframes skeleton-shimmer {
  0% {
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-M8YmkQQ5' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-LAe7i9Xu' (errno=Operation not permitted)
8b339d5 web: premium design pass (tokens, icon system, elevation, micro-interactions)
 README.md                                    |   7 +
 design/v2-d-home.png                         | Bin 0 -> 49523 bytes
 design/v2-d-modal.png                        | Bin 0 -> 138963 bytes
 design/v2-d-rail.png                         | Bin 0 -> 178920 bytes
 design/v2-d-watch.png                        | Bin 0 -> 183408 bytes
 web/src/components/ToastHost.module.css      |  88 ++++++---
 web/src/components/ToastHost.tsx             |  75 +++++++-
 web/src/components/TopBar.module.css         | 135 +++++++++-----
 web/src/components/TopBar.tsx                |  13 +-
 web/src/components/icons.tsx                 | 155 ++++++++++++++++
 web/src/concepts/AnalysisSections.module.css |  79 ++++----
 web/src/concepts/AnalysisSections.tsx        |  19 +-
 web/src/concepts/ConceptCard.module.css      |  89 ++++++---
 web/src/concepts/ConceptCard.tsx             |   9 +-
 web/src/concepts/ConceptOverlay.module.css   |  72 +++++---
 web/src/concepts/ConceptOverlay.tsx          |   3 +-
 web/src/concepts/ConceptTicker.module.css    |  27 ++-
 web/src/concepts/ConceptTicker.tsx           |  11 +-
 web/src/concepts/ConceptsDock.module.css     | 137 +++++++++-----
 web/src/concepts/ConceptsDock.tsx            |   9 +-
 web/src/index.css                            | 266 ++++++++++++++++++++++++---
 web/src/lib/analysisFormat.test.ts           |  12 +-
 web/src/lib/analysisFormat.ts                |   7 +-
 web/src/library/LibraryView.module.css       | 183 +++++++++++-------
 web/src/library/LibraryView.tsx              |   6 +-
 web/src/library/SettingsView.module.css      |  83 ++++++---
 web/src/library/SettingsView.tsx             |   2 +-
 web/src/notes/BubbleRail.module.css          | 126 ++++++++-----
 web/src/notes/BubbleRail.tsx                 |  24 ++-
 web/src/notes/NotationModal.module.css       | 219 ++++++++++++++++------
 web/src/notes/NotationModal.tsx              | 193 ++++++++++++-------
 web/src/notes/NotesPane.module.css           |  75 +++++---
 web/src/player/CCOverlay.module.css          |   9 +-
 web/src/player/HeatmapStrip.module.css       |  10 +-
 web/src/player/HeatmapStrip.tsx              |  31 +++-
 web/src/player/LocalVideoPlayer.module.css   |   2 +-
 web/src/player/PlayerChrome.module.css       |  14 +-
 web/src/player/PlayerControls.module.css     | 145 +++++++++++----
 web/src/player/PlayerControls.tsx            | 104 +++++++----
 web/src/player/SeekBar.module.css            | 164 +++++++++++------
 web/src/player/SeekBar.tsx                   |  85 +++++++--
 web/src/player/YouTubePlayer.module.css      |  21 ++-
 web/src/state/store.ts                       |  33 +++-
 web/src/study/AnalyzeButton.module.css       |  21 ++-
 web/src/study/AnalyzeButton.tsx              |  20 +-
 web/src/study/BottomDock.module.css          |  22 ++-
 web/src/study/BottomDock.tsx                 |   4 +-
 web/src/study/CompileFlow.module.css         | 229 ++++++++++++++++++-----
 web/src/study/CompileFlow.tsx                |  33 +++-
 web/src/study/ImportOverlayFlow.tsx          |  51 ++++-
 web/src/study/MarkdownPreview.module.css     |  33 ++--
 web/src/study/OverlaysToggle.module.css      |  18 +-
 web/src/study/OverlaysToggle.tsx             |  12 +-
 web/src/study/RightRail.module.css           | 162 +++++++++++-----
 web/src/study/RightRail.tsx                  |  20 +-
 web/src/study/ShareFlow.tsx                  |  24 ++-
 web/src/study/StudyView.module.css           | 125 +++++++------
 web/src/study/StudyView.tsx                  |   2 +-
 web/src/transcript/TranscriptPane.module.css |  63 +++++--
 59 files changed, 2588 insertions(+), 993 deletions(-)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-QEehyT9o' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-2JA1kBo5' (errno=Operation not permitted)
commit 8b339d5611146cb7038dd1c1dfbb489d8b074323
Author:     Ryan Morales <moralesinc.dev@gmail.com>
AuthorDate: Tue Jul 28 18:33:26 2026 -0500
Commit:     Ryan Morales <moralesinc.dev@gmail.com>
CommitDate: Tue Jul 28 18:33:26 2026 -0500

    web: premium design pass (tokens, icon system, elevation, micro-interactions)
    
    Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>

 README.md                                    |   7 +
 design/v2-d-home.png                         | Bin 0 -> 49523 bytes
 design/v2-d-modal.png                        | Bin 0 -> 138963 bytes
 design/v2-d-rail.png                         | Bin 0 -> 178920 bytes
 design/v2-d-watch.png                        | Bin 0 -> 183408 bytes
 web/src/components/ToastHost.module.css      |  88 ++++++---
 web/src/components/ToastHost.tsx             |  75 +++++++-
 web/src/components/TopBar.module.css         | 135 +++++++++-----
 web/src/components/TopBar.tsx                |  13 +-
 web/src/components/icons.tsx                 | 155 ++++++++++++++++
 web/src/concepts/AnalysisSections.module.css |  79 ++++----
 web/src/concepts/AnalysisSections.tsx        |  19 +-
 web/src/concepts/ConceptCard.module.css      |  89 ++++++---
 web/src/concepts/ConceptCard.tsx             |   9 +-
 web/src/concepts/ConceptOverlay.module.css   |  72 +++++---
 web/src/concepts/ConceptOverlay.tsx          |   3 +-
 web/src/concepts/ConceptTicker.module.css    |  27 ++-
 web/src/concepts/ConceptTicker.tsx           |  11 +-
 web/src/concepts/ConceptsDock.module.css     | 137 +++++++++-----
 web/src/concepts/ConceptsDock.tsx            |   9 +-
 web/src/index.css                            | 266 ++++++++++++++++++++++++---
 web/src/lib/analysisFormat.test.ts           |  12 +-
 web/src/lib/analysisFormat.ts                |   7 +-
 web/src/library/LibraryView.module.css       | 183 +++++++++++-------
 web/src/library/LibraryView.tsx              |   6 +-
 web/src/library/SettingsView.module.css      |  83 ++++++---
 web/src/library/SettingsView.tsx             |   2 +-
 web/src/notes/BubbleRail.module.css          | 126 ++++++++-----
 web/src/notes/BubbleRail.tsx                 |  24 ++-
 web/src/notes/NotationModal.module.css       | 219 ++++++++++++++++------
 web/src/notes/NotationModal.tsx              | 193 ++++++++++++-------
 web/src/notes/NotesPane.module.css           |  75 +++++---
 web/src/player/CCOverlay.module.css          |   9 +-
 web/src/player/HeatmapStrip.module.css       |  10 +-
 web/src/player/HeatmapStrip.tsx              |  31 +++-
 web/src/player/LocalVideoPlayer.module.css   |   2 +-
 web/src/player/PlayerChrome.module.css       |  14 +-
 web/src/player/PlayerControls.module.css     | 145 +++++++++++----
 web/src/player/PlayerControls.tsx            | 104 +++++++----
 web/src/player/SeekBar.module.css            | 164 +++++++++++------
 web/src/player/SeekBar.tsx                   |  85 +++++++--
 web/src/player/YouTubePlayer.module.css      |  21 ++-
 web/src/state/store.ts                       |  33 +++-
 web/src/study/AnalyzeButton.module.css       |  21 ++-
 web/src/study/AnalyzeButton.tsx              |  20 +-
 web/src/study/BottomDock.module.css          |  22 ++-
 web/src/study/BottomDock.tsx                 |   4 +-
 web/src/study/CompileFlow.module.css         | 229 ++++++++++++++++++-----
 web/src/study/CompileFlow.tsx                |  33 +++-
 web/src/study/ImportOverlayFlow.tsx          |  51 ++++-
 web/src/study/MarkdownPreview.module.css     |  33 ++--
 web/src/study/OverlaysToggle.module.css      |  18 +-
 web/src/study/OverlaysToggle.tsx             |  12 +-
 web/src/study/RightRail.module.css           | 162 +++++++++++-----
 web/src/study/RightRail.tsx                  |  20 +-
 web/src/study/ShareFlow.tsx                  |  24 ++-
 web/src/study/StudyView.module.css           | 125 +++++++------
 web/src/study/StudyView.tsx                  |   2 +-
 web/src/transcript/TranscriptPane.module.css |  63 +++++--
 59 files changed, 2588 insertions(+), 993 deletions(-)

exec
/bin/zsh -lc "sed -n '1,880p' design/design-spec-codex.md" in /Users/antemo/studyloop
 succeeded in 0ms:
# StudyLoop premium design upgrade spec

The right direction is “YouTube-native, study-tool precise”: preserve the familiar watch-page geometry and restrained palette, but add depth, consistent feedback, and a distinctive visualization layer for notes, concepts, and analysis. Do not introduce gradients, glassmorphism, neon glows, or decorative color.

## 1. Foundation tokens

### P0 — Replace the current root variables

Update `web/src/index.css`:

```css
:root {
  color-scheme: dark;

  /* Surfaces */
  --surface-bg: #0f0f0f;
  --surface-player: #000;
  --surface-raised: #181818;
  --surface-overlay: #212121;
  --surface-popover: #282828;
  --surface-hover: #3f3f3f;
  --surface-pressed: #4a4a4a;
  --surface-scrim: rgb(0 0 0 / 72%);

  /* Borders */
  --border-hairline: rgb(255 255 255 / 8%);
  --border-subtle: #303030;
  --border-default: #3f3f3f;
  --border-strong: #525252;

  /* Text */
  --text-primary: #f1f1f1;
  --text-secondary: #aaa;
  --text-tertiary: #717171;
  --text-disabled: rgb(241 241 241 / 38%);

  /* Semantic */
  --accent-blue: #3ea6ff;
  --accent-red: #ff0033;
  --accent-green: #4bb779;
  --accent-amber: #e0a83e;
  --danger: #ff5c5c;

  /* Elevation */
  --shadow-1:
    0 1px 2px rgb(0 0 0 / 42%),
    0 0 0 1px rgb(255 255 255 / 2%);
  --shadow-2:
    0 4px 12px rgb(0 0 0 / 46%),
    0 1px 2px rgb(0 0 0 / 36%);
  --shadow-3:
    0 12px 32px rgb(0 0 0 / 58%),
    0 2px 8px rgb(0 0 0 / 32%);
  --shadow-player:
    0 8px 28px rgb(0 0 0 / 42%);

  /* Geometry */
  --radius-xs: 4px;
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-pill: 999px;

  /* Motion */
  --duration-press: 70ms;
  --duration-fast: 120ms;
  --duration-standard: 180ms;
  --duration-panel: 240ms;
  --duration-modal: 280ms;

  --ease-standard: cubic-bezier(.2, 0, 0, 1);
  --ease-enter: cubic-bezier(0, 0, .2, 1);
  --ease-exit: cubic-bezier(.4, 0, 1, 1);

  /* Focus */
  --focus-ring:
    0 0 0 2px var(--surface-bg),
    0 0 0 4px var(--accent-blue);

  --topbar-height: 56px;

  /* Temporary compatibility during migration */
  --bg: var(--surface-bg);
  --bg-elevated: var(--surface-overlay);
  --bg-chip: var(--surface-popover);
  --bg-hover: var(--surface-hover);
  --border: var(--border-default);
  --text: var(--text-primary);
  --text-dim: var(--text-secondary);
  --accent: var(--accent-blue);
  --success: var(--accent-green);
  --warn: var(--accent-amber);
  --red: var(--accent-red);
  --radius-card: var(--radius-md);
}
```

Surface assignment must be consistent:

- Page background: `--surface-bg`
- Rail cards and bottom dock: `--surface-raised`
- Modals and side panels: `--surface-overlay`
- Dropdowns, menus, tooltips, ticker cards and toasts: `--surface-popover`
- Player: `--surface-player`
- Hover is an interaction state, never a permanent card background.

Avoid placing `--surface-overlay` cards on another `--surface-overlay` container. Use either a hairline border or elevation—not both at maximum strength.

### P0 — Global focus and disabled states

Add to `index.css`:

```css
:where(
  button,
  input,
  textarea,
  select,
  [role="button"],
  [role="slider"],
  [tabindex]
):focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

:where(button, [role="button"]):disabled {
  color: var(--text-disabled);
}

:where(button, [role="button"]) {
  -webkit-tap-highlight-color: transparent;
}
```

Remove component rules such as `outline: 1px solid var(--accent)` from inputs. They produce inconsistent rings and insufficient separation from the dark background.

---

## 2. Icon system

### P0 — Add a local inline-SVG icon layer

Create:

- `web/src/components/Icon.tsx`
- `web/src/components/Icon.module.css`
- `web/src/icons/paths.ts`

Vendor only the required Material Symbols Rounded or Material Icons path data into `paths.ts`. Material assets may be selected during development, but the runtime must make no network request and must not depend on an icon font or CDN.

```tsx
export type IconName =
  | "play" | "pause"
  | "volumeHigh" | "volumeOff"
  | "search" | "settings"
  | "editNote" | "camera"
  | "autoAwesome"
  | "closedCaption"
  | "fullscreen" | "fullscreenExit"
  | "close"
  | "bookmark"
  | "share" | "download"
  | "visibility" | "visibilityOff"
  | "notifications" | "notificationsOff"
  | "chevronUp" | "chevronDown"
  | "refresh"
  | "check"
  | "star" | "starOutline"
  | "delete"
  | "edit"
  | "noteAdd"
  | "folderOpen"
  | "copy"
  | "arrowBack";

export function Icon({
  name,
  size = 24,
  className
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      focusable="false"
      aria-hidden="true"
    >
      <path d={iconPaths[name]} />
    </svg>
  );
}
```

Rules:

- All icons use a 24×24 view box.
- Filled Material paths are preferred for player controls.
- Any stroked custom icon uses `stroke="currentColor"`, `strokeWidth={2}`, `strokeLinecap="round"` and `strokeLinejoin="round"`.
- Icons inherit `currentColor`.
- Standard visual size: 24px.
- Compact row actions: 18–20px.
- Minimum button hit area: 40×40px; use 44×44px where layout permits.
- The accessible name remains on the parent button. Decorative SVGs are `aria-hidden`.

### P0 — Replace every current glyph

| Current glyph | Replacement |
|---|---|
| `▶`, `⏸` | `play`, `pause` |
| `🔇`, `🔊` | `volumeOff`, `volumeHigh` |
| `✎` | `editNote` |
| `📷` | `camera` |
| `✨` | `autoAwesome` |
| `CC` used as an icon | `closedCaption`; retain visible “CC” only inside the SVG |
| `⚙` | `settings` |
| `⛶` | `fullscreen` / `fullscreenExit` |
| `✕`, `×` used as close controls | `close` |
| `🔖` | `bookmark` |
| `↗` | `share` |
| `⤓` | `download` |
| `👁` | `visibility` / `visibilityOff` |
| `🔔`, `🔕` | `notifications`, `notificationsOff` |
| `🔍` | `search` |
| `▲`, `▼` | `chevronUp`, `chevronDown` |
| `⟳` | `refresh` |
| `✓` | `check` |
| `★`, `☆` | `star`, `starOutline` |
| text-only edit/delete actions | `edit`, `delete` where space is constrained |

Update at minimum:

- `PlayerControls.tsx`
- `AnalyzeButton.tsx`
- `RightRail.tsx`
- `CompileFlow.tsx`
- `ImportOverlayFlow.tsx`
- `ShareFlow.tsx`
- `OverlaysToggle.tsx`
- `BubbleRail.tsx`
- `NotationModal.tsx`
- `ConceptCard.tsx`
- `ConceptOverlay.tsx`
- `ConceptsDock.tsx`
- `AnalysisSections.tsx`
- `ToastHost.tsx`
- `TopBar.tsx`
- `LibraryView.tsx`

The instructional copy in `SettingsView.tsx` must also change from “✨ Analyze pipeline” to “Analyze pipeline”; UI copy must not depend on icon glyphs.

Use icon-plus-label for StudyLoop-specific actions such as Note, Shot, Analyze and Compile outside the player. Inside the player, use icon-only buttons with `aria-label` and tooltips.

---

## 3. Typography

### P0 — Establish one explicit scale

Keep the YouTube-compatible sans-serif direction. Bundle local Roboto WOFF2 files if licensing/assets permit; otherwise retain the current fallback stack without a CDN.

```css
:root {
  --font-sans: "Roboto", "Arial", -apple-system, BlinkMacSystemFont,
    "Segoe UI", sans-serif;
  --font-mono: "SFMono-Regular", Consolas, "Liberation Mono", monospace;

  --type-11: 11px;
  --type-12: 12px;
  --type-13: 13px;
  --type-14: 14px;
  --type-16: 16px;
  --type-18: 18px;
  --type-20: 20px;

  --weight-regular: 400;
  --weight-medium: 500;
  --weight-bold: 700;
}
```

Apply:

| Role | CSS |
|---|---|
| Watch title | `20px/28px`, weight 700, `letter-spacing:-0.01em` |
| Page/settings title | `20px/28px`, weight 700 |
| Rail/card heading | `14px/20px`, weight 500 |
| Video/card title | `14px/20px`, weight 500 |
| Primary body | `14px/20px`, weight 400 |
| Dense transcript/body | `13px/19px`, weight 400 |
| Metadata | `12px/17px`, weight 400, secondary text |
| Pills/buttons | `13px/18px`, weight 500 |
| Section labels | `11px/16px`, weight 500, `letter-spacing:.06em` |
| Time values | `12px/16px`, tabular numerals |
| Tooltip | `12px/16px`, weight 500 |

Change `.StudyView .title` from 18/600 to 20/700. Do not increase rail density: its current 13–14px scale is appropriate, but normalize weights and line heights.

Use `text-wrap: pretty` on modal headings and empty-state copy. Use `font-variant-numeric: tabular-nums` on all durations, timestamps, playback rates, counts and percentages.

---

## 4. Interaction system

### P0 — Shared state behavior

Every interactive control must implement:

- Hover: color/background transition in 120ms.
- Active: `transform: scale(.96)` for icon buttons and `.98` for pills/cards.
- Focus-visible: the global double ring.
- Disabled: no hover transform; 38% foreground opacity; cursor `default`.
- Selected/toggled: persistent background or foreground change plus `aria-pressed`.
- Cursor hit areas must be larger than the visible pin, icon or diamond.

Base pattern:

```css
.interactive {
  transition:
    color var(--duration-fast) var(--ease-standard),
    background-color var(--duration-fast) var(--ease-standard),
    border-color var(--duration-fast) var(--ease-standard),
    opacity var(--duration-fast) var(--ease-standard),
    transform var(--duration-press) var(--ease-standard),
    box-shadow var(--duration-fast) var(--ease-standard);
}

.interactive:active:not(:disabled) {
  transform: scale(.96);
}
```

### P1 — Lightweight ripple

Add `data-ripple` to primary pills, circular toolbar buttons, menu items and modal actions. Do not apply it to video cards or seek markers.

```css
button[data-ripple] {
  position: relative;
  isolation: isolate;
  overflow: hidden;
}

button[data-ripple]::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  background: radial-gradient(circle, currentColor 0 10%, transparent 11%);
  opacity: 0;
  transform: scale(.25);
  transition:
    transform 260ms var(--ease-enter),
    opacity 180ms var(--ease-exit);
}

button[data-ripple]:active::after {
  opacity: .13;
  transform: scale(3);
  transition-duration: 0ms;
}
```

This is intentionally centered and CSS-only. It provides Material/YouTube-style press feedback without pointer-position JavaScript.

### State specifics

| Element | Required behavior |
|---|---|
| Pills | Hover `--surface-hover`; active scale `.98`; selected uses primary text on a light surface or blue-tinted background |
| Icon buttons | Circular 40×40 hit area; hover `rgb(255 255 255 / 12%)`; active `.94` |
| Video/rail cards | Hover background only; remove the current `scale(1.015)` from `upNextCard`, which causes visual jitter |
| Tabs | Hover foreground; active 2px underline; focus ring around the complete tab |
| Transcript rows | Hover surface; active blue-tinted surface and 3px indicator; press translateX(1px) |
| Inputs | Border strong on hover; blue border plus focus ring on focus; placeholder tertiary |
| Seek markers | 16×20 transparent hit target; visible marker grows 1.25× |
| Destructive actions | Danger color appears on hover/focus, not permanently |

---

## 5. Component polish

### Player chrome — P0

Files: `PlayerChrome.module.css`, `PlayerControls.module.css`, `PlayerControls.tsx`.

- Increase bottom scrim reach from 40px to 96px.
- Use a multi-stop gradient so controls feel embedded in the video:

```css
.scrim {
  padding: 72px 12px 0;
  background: linear-gradient(
    to top,
    rgb(0 0 0 / 92%) 0,
    rgb(0 0 0 / 68%) 38%,
    rgb(0 0 0 / 24%) 72%,
    transparent 100%
  );
  transition:
    opacity var(--duration-standard) var(--ease-standard),
    transform var(--duration-standard) var(--ease-standard);
}
```

- Player control buttons become 40×40 with 24px SVGs.
- Add a subtle `text-shadow: 0 1px 2px #000` to time text and control icons.
- Animate volume width from `0` to `72px` when the volume cluster is hovered or focused within.
- Replace the native-looking range slider with explicit track and thumb styles.
- Settings menu uses `--surface-popover`, `--shadow-3`, `--radius-md`.
- Settings-menu items need roving keyboard focus or normal tab focus; add `aria-checked` to the selected rate.
- Use a proper tooltip component for icon-only controls after 450ms hover/focus. The current native `title` attributes may remain temporarily but should not be the final presentation.

### Seek bar and heatmap — P0

Files: `SeekBar.tsx`, `SeekBar.module.css`, `HeatmapStrip.tsx`, `HeatmapStrip.module.css`.

- Keep the idle track at 3px and hover/focus track at 5px.
- Render the playhead at 12px on hover and 14px while dragging.
- Track should also expand under `:focus-visible` and a `data-dragging="true"` state, not hover alone.
- Replace width-changing pin hover rules with transforms to prevent positional movement.
- Add `data-kind` and `data-active` attributes to markers rather than relying on overlapping classes.

```css
.playhead {
  width: 12px;
  height: 12px;
  transform: translate(-50%, -50%) scale(0);
}

.track:hover .playhead,
.track:focus-visible .playhead,
.track[data-dragging="true"] .playhead {
  transform: translate(-50%, -50%) scale(1);
}

.track[data-dragging="true"] .playhead {
  transform: translate(-50%, -50%) scale(1.16);
}

.bubblePin,
.conceptTick,
.pearlMarker {
  transition:
    transform var(--duration-fast) var(--ease-standard),
    filter var(--duration-fast) var(--ease-standard),
    opacity var(--duration-fast) var(--ease-standard);
}

.bubblePin:hover,
.bubblePin:focus-visible,
.conceptTick:hover,
.conceptTick:focus-visible {
  transform: scaleX(1.5) scaleY(1.2);
}
```

- Pins and diamonds should be real `<button>` elements positioned on the slider, not non-focusable `div`s. Give each an `aria-label` with type, timestamp and label.
- Preserve the distinct visual grammar:
  - Amber vertical pin: user bubble.
  - Green lower tick: concept.
  - Blue diamond: analysis pearl.
  - White line: A/B loop boundary.
- Add tooltip entry motion: opacity plus 4px translateY, 120ms.
- Clamp tooltips within the track using a calculated `--tooltip-x` or `clamp()`; they currently can overflow at 0% and 100%.

For the heatmap, keep SVG rather than approximating the curve with CSS. Add an SVG `linearGradient` and use it for the area:

```tsx
<defs>
  <linearGradient id="heatmapFill" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stopColor="currentColor" stopOpacity=".46" />
    <stop offset="1" stopColor="currentColor" stopOpacity=".08" />
  </linearGradient>
</defs>
```

```css
.strip {
  height: 32px;
  color: var(--text-primary);
  opacity: .86;
}

.area {
  fill: url("#heatmapFill");
}

.line {
  stroke: rgb(255 255 255 / 58%);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}
```

Use a smoothed curve generator in `HeatmapStrip.tsx`—Catmull–Rom converted to cubic Bézier or monotone cubic interpolation—rather than straight point-to-point segments. Do not add glow.

### Right rail — P0

Files: `RightRail.tsx`, `RightRail.module.css`, `TranscriptPane.module.css`, `ConceptsDock.module.css`.

- Change `.card` to `--surface-raised`, `--border-hairline`, `--shadow-1`.
- Header hover should use `rgb(255 255 255 / 6%)`, not the full `#3f3f3f`.
- Replace conditional unmounting of expanded bodies with a persistent wrapper:

```tsx
<div className={styles.expandRegion} data-open={expanded}>
  <div className={styles.expandInner}>{children}</div>
</div>
```

```css
.expandRegion {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  transition:
    grid-template-rows var(--duration-panel) var(--ease-standard),
    opacity var(--duration-standard) var(--ease-standard);
}

.expandRegion[data-open="true"] {
  grid-template-rows: 1fr;
  opacity: 1;
}

.expandInner {
  min-height: 0;
  overflow: hidden;
}
```

- Chevron rotates 180° instead of switching triangle characters.
- Remove the Up Next `scale(1.015)`. Use background plus thumbnail brightness:
  `filter: brightness(1.08)` and `transform: translateY(-1px)`.
- Keep thumbnail dimensions stable at 168×94.
- Transcript active rows should use an 8% blue tint and a 3px blue indicator; hover only 5% white.
- Search boxes use `--surface-bg` inside raised cards.
- Collapse empty rail sections entirely unless they contain an actionable recovery control.

### Notation modal — P0

Files: `NotationModal.tsx`, `NotationModal.module.css`.

Restructure the dialog:

```tsx
<div className={styles.overlay} data-state="open">
  <form className={styles.card} onSubmit={handleSave}>
    <header className={styles.header}>
      <div>
        <h2>Add notation</h2>
        <span className={styles.timestamp}>33:19</span>
      </div>
      <button aria-label="Close"><Icon name="close" /></button>
    </header>
    <div className={styles.content}>…</div>
    <footer className={styles.actions}>…</footer>
  </form>
</div>
```

Specific changes:

- Card background: `--surface-overlay`.
- Card border: `--border-hairline`.
- Shadow: `--shadow-3`.
- Radius: 16px.
- Width: `min(640px, calc(100vw - 32px))`.
- Preview column: 220px desktop; full-width 16:9 preview under 620px.
- Add an explicit heading and close button; Escape remains supported.
- Quote should lose the current “card plus colored left border” treatment. Use a quiet inset surface with quotation marks and a 1px hairline.
- Place concept reference above the quote as a compact removable chip.
- Footer gets a top border and separate surface so actions do not float inside the form.
- Primary Save button receives a spinner SVG and `aria-busy`.
- Add focus trapping and restore focus to the invoking control on close.
- Backdrop click may close only when no save/capture operation is pending.

### Compile and import/share modals — P0

Files: `CompileFlow.tsx`, `CompileFlow.module.css`, `ImportOverlayFlow.tsx`, `ShareFlow.tsx`.

- Use the same modal shell as Notation instead of duplicating overlay/card/button styling.
- Extract `ModalShell.module.css` or shared global component classes.
- Caption rows use `--surface-raised`; thumbnail and input should align to a 48px minimum row height.
- Add visible progress stages: “Captions → Compile → Ready” only when those stages genuinely exist. Do not add decorative steps.
- Preview body uses `--surface-bg`, inset border and its own scrollbar.
- Long paths should be selectable, single-line by default, with a Copy icon action.
- Close actions use SVG.
- All async primary buttons use `aria-busy`, spinner icon, and stable width so labels do not shift.

### Concept ticker — P1

Files: `ConceptCard.module.css`, `ConceptTicker.module.css`.

- Remove the current 3px green left border; it reads like a generic alert card.
- Use a 6px success dot beside the title and a restrained top metadata row.
- Surface: `--surface-popover`.
- Border: `--border-hairline`.
- Shadow: `--shadow-2`.
- Width: 280px.
- Body padding: 12px 36px 12px 14px.
- Card hover: translateY(-1px), `--shadow-3`.
- Dismiss button: 32×32 hit target with a 20px close icon.
- Limit visible stack to three; older cards collapse into the existing “+N more” control.
- New cards enter with 12px horizontal movement and opacity. Existing cards shift vertically using transform transitions.
- Ticker must sit above player controls only when chrome is hidden; when chrome appears, transition its bottom offset from 12px to 72px.

### Bubble rail — P1

Files: `BubbleRail.tsx`, `BubbleRail.module.css`.

- Use `--surface-raised` rows, hairline borders, 10px radius.
- Increase thumbnails from 64×36 to 80×45.
- Make the whole content area clickable to seek; keep edit/delete as explicit buttons.
- Hide row actions until row hover/focus-within:

```css
.itemActions {
  opacity: 0;
  transform: translateX(4px);
  transition:
    opacity var(--duration-fast) var(--ease-standard),
    transform var(--duration-fast) var(--ease-standard);
}

.item:hover .itemActions,
.item:focus-within .itemActions {
  opacity: 1;
  transform: none;
}
```

- Keep timestamp as a blue chip, but reduce the tint to 10%.
- Replace text-glyph actions with 20px Edit, Note Add and Delete icons.
- Deleted rows should fade and collapse over 180ms before state removal.

### Library cards and empty states — P1

Files: `LibraryView.module.css`, `LibraryView.tsx`.

- Do not treat every video card as an elevated panel. Preserve YouTube’s flat cards.
- Add thumbnail elevation only: `box-shadow: var(--shadow-1)`.
- Card hover lifts the thumbnail 2px and brightens it; title changes to primary white.
- Remove the purple/blue placeholder gradient. Use `--surface-raised` plus a centered local Video icon or generated thumbnail.
- Empty state uses a 48px outline video/library icon, one heading, one sentence and one primary CTA. No emoji, illustration, or gradient.
- Reduce empty-card border prominence to `--border-hairline`.

### Toasts — P1

Files: `ToastHost.tsx`, `ToastHost.module.css`.

- Use `--surface-popover`, `--shadow-3`, 10px radius.
- Add a semantic SVG: check, warning/info, or error.
- Do not color the full border. Use a semantic 3px indicator or semantic icon.
- Minimum height: 48px.
- Add exit state before removal:

```css
.toast[data-state="entering"] {
  animation: toast-in 180ms var(--ease-enter);
}

.toast[data-state="exiting"] {
  animation: toast-out 140ms var(--ease-exit) forwards;
}
```

- Pause auto-dismiss while hovered or keyboard-focused.
- Keep `aria-live="polite"` for informational/success messages; errors should use `role="alert"`.

### Loading skeletons — P1

Create a reusable `Skeleton.module.css`.

Use skeletons for:

- Library thumbnail/title/meta.
- Transcript rows.
- Related-video rows.
- Concept-analysis sections.
- Screenshot capture preview.

```css
.skeleton {
  border-radius: var(--radius-xs);
  background: linear-gradient(
    90deg,
    rgb(255 255 255 / 5%) 20%,
    rgb(255 255 255 / 10%) 38%,
    rgb(255 255 255 / 5%) 56%
  );
  background-size: 220% 100%;
  animation: skeleton-shimmer 1.4s linear infinite;
}
```

Skeletons must match final geometry to avoid layout shift. Do not use a spinner for list loading; reserve spinners for short, blocking operations such as saving or capturing a frame.

### Custom scrollbars — P0

The current global scrollbar remains visually heavy. Replace it with:

```css
* {
  scrollbar-width: thin;
  scrollbar-color: #606060 transparent;
}

::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  min-height: 32px;
  border: 2px solid transparent;
  border-radius: 999px;
  background: #606060;
  background-clip: padding-box;
}

::-webkit-scrollbar-thumb:hover {
  background: #8a8a8a;
  background-clip: padding-box;
}
```

For the transcript, concepts and modal preview, the thumb should remain hidden until the region is hovered or focused if browser support permits. Do not reduce below an effective 4px painted width.

---

## 6. Motion system

### P0 — Required motion

| Event | Duration | Easing | Motion |
|---|---:|---|---|
| Button hover | 120ms | standard | color/background |
| Button press | 70ms | standard | scale |
| Tooltip | 120ms | enter/exit | opacity + 4px Y |
| Rail expand | 240ms | standard | grid rows + opacity |
| Ticker entry | 180ms | enter | 12px X + opacity |
| Ticker removal | 140ms | exit | 8px X + opacity |
| Modal backdrop | 180ms | enter | opacity |
| Modal card enter | 280ms | enter | opacity + 12px Y + `.98→1` scale |
| Modal exit | 180ms | exit | opacity + 8px Y + `.99` scale |
| Side panel | 240ms | standard | translateX |
| Toast | 180ms | enter | 8px Y + opacity |

Modal CSS:

```css
.overlay[data-state="opening"] {
  animation: backdrop-in 180ms var(--ease-enter) both;
}

.card[data-state="opening"] {
  animation: modal-in var(--duration-modal) var(--ease-enter) both;
}

.card[data-state="closing"] {
  animation: modal-out 180ms var(--ease-exit) both;
}

@keyframes modal-in {
  from { opacity: 0; transform: translateY(12px) scale(.98); }
  to   { opacity: 1; transform: none; }
}

@keyframes modal-out {
  from { opacity: 1; transform: none; }
  to   { opacity: 0; transform: translateY(8px) scale(.99); }
}
```

Current conditional rendering removes modals and panels before exit animation can run. Add a small `usePresence(open, 180)` helper or maintain `data-state="closing"` until `animationend`.

### P0 — Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
  }

  .skeleton {
    animation: none;
    background: rgb(255 255 255 / 7%);
  }
}
```

Do not disable state changes, focus rings, loading indication, or expanded/collapsed visibility—only their animation.

---

## 7. Priority plan

### P0 — Defines the premium feel

1. Introduce the complete surface, elevation, motion and focus tokens.
2. Replace every emoji/glyph control with local inline SVGs.
3. Normalize typography and raise the watch title to 20/700.
4. Apply complete hover, active, focus-visible and disabled states.
5. Polish player chrome, volume, settings menu and seek bar.
6. Make seek pins/diamonds keyboard-operable buttons.
7. Consolidate modal styling and add proper enter/exit behavior.
8. Animate right-rail expansion without conditional unmounting.
9. Install the custom scrollbar and reduced-motion rules.

### P1 — Strong quality gains

1. Heatmap gradient and smoothed SVG curve.
2. Ticker stacking and coordinated entry/removal.
3. Bubble row action reveal and deletion motion.
4. Toast semantic icons and exit lifecycle.
5. Skeletons matching real content geometry.
6. Library thumbnail hover and non-gradient placeholders.
7. Tooltips for all icon-only controls.
8. Focus trapping and focus restoration for dialogs.

### P2 — Nice refinements

1. Animate volume control reveal within the player cluster.
2. Clamp seek tooltips at timeline edges.
3. Pause toast timers on hover/focus.
4. Subtle thumbnail brightness changes on card hover.
5. Persist modal size/scroll state during async compile operations.
6. Add motion-aware ticker repositioning when player chrome appears.

## Acceptance criteria

The upgrade is complete only when:

- No emoji or Unicode glyph remains as an interactive icon.
- Every interactive element has visible hover, active, focus-visible and disabled behavior.
- Keyboard users can reach seek markers, ticker dismissal, rail headers and modal actions.
- Modal and panel exit animations are visible rather than cut off by unmounting.
- No component contains a new hard-coded shadow or transition duration.
- Surface assignment follows the four-layer system.
- Loading lists do not jump when real data replaces skeletons.
- `prefers-reduced-motion` removes all nonessential motion.
- The player remains visually dominant; elevation and accent color never compete with the video.

codex
The screenshots show a clear split: the token/icon pass improved consistency, but the watch surface is still materially denser and more “internal tool” than first-party YouTube. I’m now verifying which of those visual misses are structural versus screenshot-state artifacts, and checking the nonvisual criteria (keyboard reachability, exit presence, reduced motion).
exec
/bin/zsh -lc "sed -n '250,360p' web/src/index.css; printf '\\nEMOJI_GLYPHS\\n'; rg -n \"[▶⏸🔇🔊✎📷✨⚙⛶✕×🔖↗⤓👁🔔🔕🔍▲▼⟳✓★☆⚠️✅❌📚🎬🎥📝]\" web/src || true; printf '\\nUNICODE_NONASCII_TSX\\n'; rg -n \"["'^'"\\x00-\\x7F]\" web/src --glob '*.tsx' --glob '*.ts' || true; printf '\\nHARD_CODED_TRANSITIONS_SHADOWS\\n'; rg -n \"transition["'^;]*(ms|s)|box-shadow:'"\\s*(?"'!var'"\\()|filter:\\s*drop-shadow\" web/src --glob '*.css' --pcre2; printf '\\nMODAL_PRESENCE\\n'; rg -n \"usePresence|data-state|animationend|onAnimationEnd|if \\("'!.*open|return null|createPortal|role='"\\\"dialog\\\"|aria-modal|focus|Escape\" web/src/notes/NotationModal.tsx web/src/study/*Flow.tsx web/src/study/ShareFlow.tsx; printf '\\nSEEK_MARKERS\\n'; rg -n \"marker|bubblePin|conceptTick|pearlMarker|button|aria-label|data-kind|data-active|role=\\\"slider\\\"\" web/src/player/SeekBar.tsx" in /Users/antemo/studyloop
 succeeded in 0ms:
    90deg,
    rgb(255 255 255 / 5%) 20%,
    rgb(255 255 255 / 10%) 38%,
    rgb(255 255 255 / 5%) 56%
  );
  background-size: 220% 100%;
  animation: skeleton-shimmer 1.4s linear infinite;
}

@keyframes skeleton-shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -20% 0;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
  }

  .skeleton {
    animation: none;
    background: rgb(255 255 255 / 7%);
  }
}

EMOJI_GLYPHS
web/src/player/PlayerControls.tsx:217:                  {r}×

UNICODE_NONASCII_TSX
web/src/player/PlayerControls.tsx:2:// V2 "Player chrome": "left group play/pause, volume, time … right cluster: note ·
web/src/player/PlayerControls.tsx:3:// shot · analyze · CC · settings(speed/loop) · fullscreen"). Play/pause, volume,
web/src/player/PlayerControls.tsx:62:  // `health === null` means the check hasn't resolved yet — don't disable on
web/src/player/PlayerControls.tsx:75:    // in effect (see PlayerHandle.setRate) — YouTube in particular can snap
web/src/player/PlayerControls.tsx:144:            {loopB != null ? `–${formatTimestamp(loopB)}` : "–…"}
web/src/player/PlayerControls.tsx:166:        title={ffmpegMissing ? "ffmpeg not found on PATH — screenshots are disabled" : "Screenshot (S)"}
web/src/player/PlayerControls.tsx:177:        title={analyzing ? `Analyzing… ${analyzeStatus.pct}%` : analysis ? "Re-analyze" : "Analyze"}
web/src/player/PlayerControls.tsx:217:                  {r}×
web/src/player/PlayerControls.tsx:222:            <div className={styles.menuSectionLabel}>A–B loop</div>
web/src/player/SeekBar.tsx:2:// and marker layers rendered purely from props — bubble pins and concept ticks —
web/src/player/SeekBar.tsx:3:// plus an optional heatmap density strip (SPEC "Player chrome" — see HeatmapStrip).
web/src/player/SeekBar.tsx:26:/** V2-C: a pearl diamond — distinct from bubble pins/concept ticks (SPEC "Analysis engine"). */
web/src/player/SeekBar.tsx:32:/** V2-C: one marker from an imported overlay bundle — colored per author handle (SPEC "Overlays"). */
web/src/player/SeekBar.tsx:172:            title={tick.title ? `${tick.title} — ${formatTimestamp(tick.t)}` : formatTimestamp(tick.t)}
web/src/player/SeekBar.tsx:197:        {/* V2-C: pearl diamonds — visually distinct from bubble pins (dots above)
web/src/player/SeekBar.tsx:218:        {/* V2-C: imported overlay markers — one colored dot per author handle. */}
web/src/player/SeekBar.tsx:226:            aria-label={`${marker.handle} — ${formatTimestamp(marker.t)}`}
web/src/player/SeekBar.tsx:227:            title={`${marker.handle} — ${formatTimestamp(marker.t)}`}
web/src/player/LocalVideoPlayer.tsx:62:        // snapping to a discrete set, unlike YouTube's IFrame API) — but the
web/src/player/LocalVideoPlayer.tsx:83:    // Apply the persisted playback rate immediately — a fresh <video> element
web/src/player/LocalVideoPlayer.tsx:156:    // Intentionally run once per mount — StudyView remounts this component (via
web/src/player/types.ts:26:   * themselves) — for YouTube, the player can snap the requested rate to its
web/src/player/types.ts:34:   * element isn't). Omitted entirely when the player accepts any rate — the
web/src/player/types.ts:38:  /** Current volume, normalized 0–1 regardless of the underlying player's own scale. */
web/src/player/types.ts:41:   * Applies a new volume (0–1, clamped) and syncs the store with it itself —
web/src/player/youtubeApi.ts:4:// at most once per page load — every YouTubePlayer mount (across project
web/src/player/youtubeApi.ts:70:// `onYouTubeIframeAPIReady` or error out — a stalled network request would
web/src/player/youtubeApi.ts:78: * YouTubePlayer instances mount over the app's lifetime — every caller
web/src/player/youtubeApi.ts:83: * rejects *and* resets itself to `null` — so a subsequent call (e.g. the
web/src/player/youtubeApi.ts:101:      finishReject(new Error("Timed out loading the YouTube player (15s) — check your network connection."));
web/src/player/HeatmapStrip.tsx:2:// progress bar, YouTube "most replayed" style. Purely presentational — takes a
web/src/player/HeatmapStrip.tsx:36:  const width = 100; // viewBox units — scales to 100% via the SVG's width attr
web/src/player/PlayerChrome.tsx:18:  /** Reported whenever the scrim's visible/hidden state changes — CCOverlay
web/src/player/PlayerChrome.tsx:77:  // changes, debounced" — the debounce itself lives in the store's
web/src/player/PlayerChrome.tsx:115:  // concepts") — same shape, so they render identically, just sourced from
web/src/player/YouTubePlayer.tsx:5:// has no timeupdate-style event, so getCurrentTime() must be polled — same
web/src/player/YouTubePlayer.tsx:18:// module-eval time — these are stable, documented constants.
web/src/player/YouTubePlayer.tsx:41:  // blank — bumping retryToken re-runs the load effect for a fresh attempt
web/src/player/YouTubePlayer.tsx:81:          // (metadata still loading) — keep refreshing until it settles,
web/src/player/YouTubePlayer.tsx:129:                  // supported value — read back what actually took effect so
web/src/player/YouTubePlayer.tsx:210:    // Otherwise runs once per mount — StudyView remounts this component (via
web/src/lib/heatmap.ts:2:// `GET /api/projects/:id/heatmap` (server-side Gaussian smoothing — see
web/src/lib/heatmap.ts:19: * each other (approximates the server's eventual Gaussian smoothing — see
web/src/lib/heatmap.ts:20: * SPEC — without needing real math here). Returns values normalized to
web/src/lib/heatmap.ts:38:  // Box blur, radius 2 — cheap smoothing so the strip reads as a curve
web/src/lib/heatmap.ts:58:/** Density stub fed to the heatmap strip — bubbles only, for now (SPEC: pearls come with the analysis engine). */
web/src/lib/markdownLite.test.ts:102:    const blocks = parseMarkdownLite("- MODULE 1 — Concave Shoulders (31:10)\n- MODULE 7 — Supine Entanglement");
web/src/lib/markdownLite.test.ts:107:          { inline: [{ type: "text", value: "MODULE 1 — Concave Shoulders (31:10)" }] },
web/src/lib/markdownLite.test.ts:108:          { inline: [{ type: "text", value: "MODULE 7 — Supine Entanglement" }] },
web/src/lib/markdownLite.test.ts:116:      "# Open Guard Seated — Volume 1",
web/src/lib/markdownLite.test.ts:134:      "- MODULE 1 — Concave Shoulders (31:10)",
web/src/lib/markdownLite.test.ts:139:    expect(blocks[0]).toEqual({ type: "heading", level: 1, text: "Open Guard Seated — Volume 1" });
web/src/lib/analysisFormat.ts:2:// (AnalysisPanel, ConceptTicker, PlayerChrome's seek ticks) — kept here rather
web/src/lib/analysisFormat.ts:18:/** Importance-sorted (3 first), then chronological within the same importance — matches the compiled doc's Pearls section. */
web/src/lib/analysisFormat.ts:23:/** Three-slot filled/outline star state for a pearl's importance rating —
web/src/lib/analysisFormat.ts:34: * handle"). A simple string hash, not cryptographic — collisions between two
web/src/lib/selectors.ts:46:/** Concepts with at least one anchor at or before t — i.e. playback has passed them. */
web/src/lib/markdownLite.ts:3: * CommonMark implementation — it only needs to faithfully render exactly
web/src/lib/markdownLite.ts:10: * this ever sees them — see renderNotesTokens).
web/src/lib/markdownLite.ts:124: * `../shots/x.jpg` in Captures — see compileRenderer.ts) down to the
web/src/lib/hotkeys.ts:54:          // up in effect (see PlayerHandle.setRate) — no separate
web/src/lib/types.ts:2:// Kept as plain interfaces here rather than importing across the workspace boundary —
web/src/lib/types.ts:53:  /** YouTube channel/author name (source.type === "youtube" only) — drives the channel-row name. */
web/src/lib/types.ts:65:  /** Pre-resolved YouTube captions to persist as captions.json — youtube sources only. */
web/src/lib/types.ts:67:  /** Channel/author name resolved by POST /api/youtube/resolve — youtube sources only. */
web/src/lib/types.ts:69:  /** Related-video list resolved by POST /api/youtube/resolve — youtube sources only. */
web/src/lib/types.ts:111:/** GET/PUT /api/config response shape — the server never echoes the actual key back. */
web/src/lib/types.ts:124:/** Body accepted by PUT /api/config — this is the only place the plaintext key travels. */
web/src/lib/types.ts:214:  /** Channel/author name — populated when Innertube resolved the video (V2-B). */
web/src/lib/types.ts:218:  /** Related videos — [] when Innertube didn't resolve this video (yt-dlp fallback path). */
web/src/lib/types.ts:221:  /** True if yt-dlp isn't installed — the project should still be created (title = URL). */
web/src/lib/types.ts:231:/** GET /api/health — lets the UI disable ffmpeg/yt-dlp-dependent controls with a clear reason. */
web/src/lib/conceptFormat.ts:3: * (server/src/lib/concepts.ts section bodies — plain markdown paragraphs,
web/src/lib/conceptFormat.ts:76: * bold markup — used for the ticker's compact card ("title + first
web/src/lib/notesFormat.ts:5: * `[mm:ss]` links (`/\^t:(\d+(?:\.\d+)?)/g`) — kept in sync deliberately since
web/src/lib/heatmap.test.ts:24:    // A single point at bucket index 5 (of 10) spreads into buckets 3..7 —
web/src/lib/router.ts:1:// Minimal hash-based router. No routing library — StudyLoop has exactly three
web/src/lib/compileFlow.ts:5: * no DOM — see web/src/lib/notesFormat.ts for the same convention).
web/src/lib/compileFlow.test.ts:29:    // shot: null but is still a real capture — nothing to caption without an
web/src/concepts/ConceptsDock.tsx:47:  // uses (max(watchedUpTo, currentTime)), not raw currentTime alone — so
web/src/concepts/ConceptsDock.tsx:88:  if (!currentProject) return <p className={styles.status}>Loading…</p>;
web/src/concepts/ConceptsDock.tsx:128:            {attaching ? "Attaching…" : "Attach"}
web/src/concepts/ConceptsDock.tsx:141:          placeholder="Search concepts…"
web/src/concepts/ConceptsDock.tsx:154:      {conceptsLoading && <p className={styles.status}>Loading concepts…</p>}
web/src/concepts/ConceptOverlay.tsx:4:// lib/conceptFormat.ts — no external markdown lib per SPEC quality bar.
web/src/concepts/AnalysisSections.tsx:4:// middle, "AI breakdown" + Themes below — SPEC: "'Pearls' group at top ...
web/src/concepts/ConceptTicker.tsx:5:// Ephemeral UI state lives here (not the store) — StudyView remounts this whole
web/src/concepts/ConceptTicker.tsx:18: *  not a bottom-dock tab — the ticker's overflow chip scrolls it into view. */
web/src/concepts/ConceptTicker.tsx:35:  /** True while the player chrome scrim is visible — the ticker shifts its
web/src/concepts/ConceptTicker.tsx:36:   *  bottom offset up so it never sits under the control cluster (codex §5
web/src/concepts/ConceptTicker.tsx:51:  // Keys dismissed (auto or manual) while still inside their window — kept out
web/src/concepts/ConceptTicker.tsx:62:  // A stable string to key the effect off — `active` is a fresh array every
web/src/concepts/ConceptCard.tsx:23:    // (a fresh ConceptCard is mounted per ticker entry — see ConceptTicker's
web/src/notes/NotesPane.tsx:4:// its own local buffer — the store, not this component, owns the debounce
web/src/notes/NotesPane.tsx:8:// the same field being written from elsewhere — nothing to reconcile.
web/src/notes/NotesPane.tsx:44:    saving: "Saving…",
web/src/notes/NotesPane.tsx:64:        <div className={styles.loading}>Loading notes…</div>
web/src/notes/NotesPane.tsx:71:          placeholder="Long-running notes… use @ timestamp to drop in a seek link."
web/src/notes/NotationModal.tsx:2:// (opened by the N hotkey or the "Note" button in PlayerControls — see
web/src/notes/NotationModal.tsx:32:  // waits on modal.shotPromise (bounded — after 15s it offers "Save without
web/src/notes/NotationModal.tsx:118:        // new N press) while we were waiting — don't act on stale intent.
web/src/notes/NotationModal.tsx:165:            {modal.shotLoading && <div className={styles.spinner} aria-label="Capturing frame…" />}
web/src/notes/NotationModal.tsx:205:              placeholder="Add a note…"
web/src/notes/NotationModal.tsx:229:            {modal.saving ? "Saving…" : waitingForShot ? "Capturing…" : "Save"}
web/src/notes/BubbleRail.tsx:47:    return <p className={styles.status}>Loading captures…</p>;
web/src/notes/BubbleRail.tsx:69:                <span className={styles.thumbPlaceholder}>—</span>
web/src/components/icons.tsx:2:// §2 hand-rolled path data, Material-style/Apache-2.0 heritage — see README
web/src/components/icons.tsx:3:// attribution — as the starting set, wrapped in codex's `<Icon name size />`
web/src/components/ToastHost.tsx:1:// Global toast host — mounted once in App. SPEC: "All errors surface as toasts,
web/src/components/ToastHost.tsx:3:// by their auto-dismiss timer or the dismiss button) — this component keeps
web/src/components/ToastHost.tsx:6:// unmounting (codex §5/§6 "Add exit state before removal").
web/src/components/TopBar.tsx:4:// author + duration) sections; ↑/↓/Enter/Esc navigate and act on either
web/src/components/TopBar.tsx:5:// section. Innertube-down degrades to an empty YouTube section — never an
web/src/components/TopBar.tsx:86:          // from the server (see lib/innertube.ts / lib/search.ts) — nothing
web/src/components/TopBar.tsx:92:          // failure, which already degrades server-side) — fail quiet, the
web/src/components/TopBar.tsx:212:                <div className={styles.dropdownEmpty}>Searching…</div>
web/src/components/TopBar.tsx:230:                      {item.durationSeconds ? ` · ${formatTimestamp(item.durationSeconds)}` : ""}
web/src/components/TopBar.tsx:240:                  {searching ? "Searching…" : "No YouTube results — try a different search."}
web/src/components/TopBar.tsx:263:                      {video.durationSeconds ? ` · ${formatTimestamp(video.durationSeconds)}` : ""}
web/src/state/store.ts:1:// Single source of truth for the app, per SPEC ("state/store.ts — zustand store,
web/src/state/store.ts:26:// card (see study/RightRail.tsx) — the description box below the player now
web/src/state/store.ts:37:// and re-running them shouldn't trigger a re-render) — see pauseToastTimer.
web/src/state/store.ts:59:// the store — CompileFlow (via runCompile) and StudyView's unmount cleanup
web/src/state/store.ts:60:// in particular — without needing a live reference to whatever component
web/src/state/store.ts:72:// module-level state for the same reason as notesSaveTimer above — a single
web/src/state/store.ts:97:/** F4 Notation modal state — a shot capture is in flight the moment the modal opens. */
web/src/state/store.ts:110:   * settled or if no capture was attempted at all — e.g. ffmpeg is known
web/src/state/store.ts:128:// CC-on/off is persisted client-side only (V2-A chunk — the project model's
web/src/state/store.ts:148:    // Storage can throw (private browsing, quota) — CC toggling still works
web/src/state/store.ts:173:  /** `null` until loadHealth() resolves once — see App.tsx mount effect. */
web/src/state/store.ts:287:   *  No API key configured → toast + navigate to Settings, per SPEC. */
web/src/state/store.ts:296:  /** Debounced GET /api/projects/:id/heatmap — call after analyze completes or bubbles change. */
web/src/state/store.ts:305:  /** {path} import (SPEC: "multipart or {path}" — the web app only drives the path form). */
web/src/state/store.ts:320:   *  hover/focus) — codex §5 "Pause auto-dismiss while hovered or
web/src/state/store.ts:331:      // Non-browser environment (unit tests) — no hash to sync, just update the route directly.
web/src/state/store.ts:337:      // Same route (e.g. re-opening the same project) — hashchange won't fire.
web/src/state/store.ts:351:    // re-running on re-renders) fired several stacked GETs on first load —
web/src/state/store.ts:413:      // *why* they're disabled. No toast — this runs once on app mount and
web/src/state/store.ts:456:      // yt-dlp missing must not block project creation — playback/captions are
web/src/state/store.ts:459:        get().pushToast("yt-dlp not found — the project was created without a title or captions.", "info");
web/src/state/store.ts:467:        // project's transcript (see server/src/routes/projects.ts) — the
web/src/state/store.ts:472:        // Up-next cabinet — both resolved by Innertube in the same call
web/src/state/store.ts:512:    // checks it's still current before touching state — if the user
web/src/state/store.ts:516:    // "Loading project…" forever bug: a stale response could flip
web/src/state/store.ts:617:    // run happens to still be in flight from a prior session — e.g. the tab
web/src/state/store.ts:618:    // was reloaded mid-run — the status endpoint picks that up too) without
web/src/state/store.ts:741:      // in flight — only apply if we're still looking at the same project.
web/src/state/store.ts:821:    // debounced save lands — this is what makes it safe for flushNotes() (and
web/src/state/store.ts:884:    // Supersede any pending debounced save — it would otherwise fire later
web/src/state/store.ts:913:    // server after a wasted round trip) — open the modal straight into its
web/src/state/store.ts:930:      get().pushToast("ffmpeg not found on PATH — capturing a frame is disabled", "info");
web/src/state/store.ts:1006:    // button (and the S hotkey, which calls this same action) — explain why
web/src/state/store.ts:1009:      get().pushToast("ffmpeg not found on PATH — screenshots are disabled", "info");
web/src/state/store.ts:1020:        get().pushToast(`Screenshot failed (${res.error ?? "unknown error"}) — capture saved without image`, "error");
web/src/state/store.ts:1070:    // No key configured → toast + open Settings (SPEC), unless the config
web/src/state/store.ts:1071:    // hasn't loaded yet — in that case load it first rather than guessing.
web/src/state/store.ts:1095:        // Another POST already started a run (e.g. a second tab) — just
web/src/state/store.ts:1142:          // Transient poll failure (e.g. a dropped request) — retry on the next tick.
web/src/state/store.ts:1164:          // Heatmap is presentational only — fail quiet rather than toast on every change.
web/src/state/store.ts:1198:        get().pushToast(`Imported — but ${res.sourceMismatch}`, "info");
web/src/state/store.test.ts:6:  it("clamps to the 0.5–2.5 range", () => {
web/src/state/store.test.ts:30:    // Two stacked calls before the first resolves — mirrors React
web/src/state/store.test.ts:147:    // Start loading "a" (its getProject call hangs on `pendingA`), then — before
web/src/state/store.test.ts:148:    // it resolves — navigate to "b", the way a user clicking two library items
web/src/state/store.test.ts:149:    // in quick succession would. This used to be the "Loading project… forever"
web/src/state/store.test.ts:209:  it("no API key configured → toasts an info message and navigates to Settings, without ever POSTing /analyze", async () => {
web/src/state/store.test.ts:226:  it("API key configured → POSTs /analyze and applies the returned running status", async () => {
web/src/state/store.test.ts:248:  it("idempotent path: POST /analyze returns the full Analysis directly (analysis.json already existed) → applies it immediately, marks done", async () => {
web/src/state/store.test.ts:298:describe("openOrCreateYoutubeProject (V2-B — search/up-next click target)", () => {
web/src/study/AnalyzeButton.tsx:1:// V2-C "Analysis engine" (SPEC): the channel-row Analyze pill. No API key →
web/src/study/AnalyzeButton.tsx:5:// same store actions — see its onClick there — so behavior stays identical
web/src/study/AnalyzeButton.tsx:28:    ? `Analyzing… ${analyzeStatus.pct}%`
web/src/library/LibraryView.tsx:2:// instructor → series, and renders each video as a YouTube-home-style thumbnail
web/src/library/LibraryView.tsx:3:// card (gradient placeholder + film glyph — real server-side thumbnails are out of
web/src/library/LibraryView.tsx:75:        placeholder="Paste a YouTube URL to start studying it…"
web/src/library/LibraryView.tsx:81:        {submitting ? "Adding…" : "Add"}
web/src/library/LibraryView.tsx:97:        {opening && <span className={styles.thumbOverlay}>Opening…</span>}
web/src/library/LibraryView.tsx:156:          {libraryLoading ? "Scanning…" : "Rescan library"}
web/src/library/LibraryView.tsx:170:      {libraryLoading && !libraryLoaded && <div className={styles.status}>Loading your library…</div>}
web/src/library/LibraryView.tsx:184:          <p className={styles.emptyOr}>— or paste a YouTube URL above to start immediately.</p>
web/src/study/RightRail.tsx:1:// SPEC V2 layout: right rail (~402px) — Transcript panel (collapsible header
web/src/study/RightRail.tsx:73:        {opening && <span className={styles.upNextOverlay}>Opening…</span>}
web/src/study/RightRail.tsx:92:  // SPEC: "Local videos: section hidden entirely (no dead space)" — this is
web/src/study/RightRail.tsx:142:          No related videos yet — try the refresh button, or Innertube may be unreachable right now.
web/src/study/RightRail.tsx:207:/** Only renders a card shell at all once there's an overlay to show — otherwise an empty "Others' analysis" header with nothing under it. */
web/src/study/OverlaysToggle.tsx:2:// layer for every imported overlay bundle — this file owns the pill itself
web/src/study/OverlaysToggle.tsx:22:    // Only re-run when the project itself changes — loadOverlays is stable
web/src/study/OverlaysToggle.tsx:35:      title={overlays.length === 0 ? "No imported analyses yet — use Import to add one" : "Toggle others' imported analysis markers"}
web/src/transcript/TranscriptPane.tsx:2:// viewport (hand-rolled — no react-window dependency), highlights + auto-scrolls
web/src/transcript/TranscriptPane.tsx:49:  // Reset scroll position when the search query changes — the old scrollTop
web/src/transcript/TranscriptPane.tsx:106:  // results — a match list can be long too (a common word in an hour-long
web/src/transcript/TranscriptPane.tsx:123:          placeholder="Search transcript… (Enter jumps)"
web/src/transcript/TranscriptPane.tsx:135:        {loading && <div className={styles.status}>Loading transcript…</div>}
web/src/library/SettingsView.tsx:2:// split client-side — simplest possible form per SPEC, no fancy list UI needed.
web/src/library/SettingsView.tsx:27:  // `anthropicApiKeySet`), so this field always starts empty — typing in it
web/src/library/SettingsView.tsx:60:        // Omit entirely when left blank — sending `null` here would clear an
web/src/library/SettingsView.tsx:148:              ? "A key is currently saved — leave blank to keep it, or type a new one to replace it."
web/src/library/SettingsView.tsx:156:            placeholder={config?.anthropicApiKeySet ? "•••••••• (leave blank to keep)" : "sk-ant-…"}
web/src/library/SettingsView.tsx:192:            {saving ? "Saving…" : "Save & rescan"}
web/src/App.tsx:13:  // Checked once per app load (not per-project) — see store.ts loadHealth.
web/src/study/BottomDock.tsx:1:// SPEC V2 "description box (YT-style, tabs): [Notes | Bubbles]" — Concepts moved
web/src/study/CompileFlow.tsx:1:// F10 compile UI: the header "Compile" button plus its two-step modal flow —
web/src/study/CompileFlow.tsx:67:      pushToast("Could not copy to clipboard — your browser may be blocking clipboard access", "error");
web/src/study/CompileFlow.tsx:81:        {compiling ? "Compiling…" : "Compile"}
web/src/study/CompileFlow.tsx:95:              caption yet. Add a quick note or skip — compile works either way.
web/src/study/CompileFlow.tsx:109:                      <span>—</span>
web/src/study/CompileFlow.tsx:117:                      placeholder="Add a caption…"
web/src/study/CompileFlow.tsx:131:                {savingCaptions ? "Saving…" : "Save & compile"}
web/src/study/ShareFlow.tsx:1:// V2-C "Share bundles" (SPEC): the Share action pill — POST
web/src/study/ShareFlow.tsx:25:      pushToast("Could not copy to clipboard — your browser may be blocking clipboard access", "error");
web/src/study/ShareFlow.tsx:41:        {exportingAnalysis ? "Exporting…" : "Share"}
web/src/study/ShareFlow.tsx:55:              <code>.studyloop.json</code> file — never the video itself.
web/src/study/StudyView.tsx:53:  // Both source types are fully playable (YouTube via the IFrame API) — kept
web/src/study/StudyView.tsx:66:      // this order, before clearProjectSession() runs — so they see the
web/src/study/StudyView.tsx:92:  // cleanup above — this effect only owns the steady-state periodic tick.
web/src/study/StudyView.tsx:115:  // library-scan metadata) — cross-reference the already-loaded library list
web/src/study/StudyView.tsx:136:        <div className={styles.status}>Loading project…</div>
web/src/study/ImportOverlayFlow.tsx:2:// app drives the {path} import form (see lib/api.ts importAnalysisByPath) —
web/src/study/ImportOverlayFlow.tsx:30:      // store already toasted the error — keep the modal open so the user can retry/fix the path
web/src/study/ImportOverlayFlow.tsx:109:                {importing ? "Importing…" : "Import"}
web/src/study/MarkdownPreview.tsx:2:// compile preview modal. Pure rendering only — all parsing logic (and its

HARD_CODED_TRANSITIONS_SHADOWS
web/src/player/CCOverlay.module.css:9:  transition: bottom var(--duration-standard) var(--ease-standard);
web/src/player/SeekBar.module.css:12:  transition: height var(--duration-fast) var(--ease-standard);
web/src/player/SeekBar.module.css:47:  box-shadow: 0 0 0 1px rgb(0 0 0 / 30%);
web/src/player/SeekBar.module.css:49:  transition: transform var(--duration-fast) var(--ease-standard);
web/src/player/SeekBar.module.css:113:  box-shadow: var(--shadow-2);
web/src/player/SeekBar.module.css:257:  box-shadow: var(--shadow-2);
web/src/player/YouTubePlayer.module.css:29:  transition: background-color var(--duration-fast) var(--ease-standard);
web/src/player/PlayerControls.module.css:131:  box-shadow: var(--shadow-3);
web/src/player/PlayerControls.module.css:203:  transition: background-color var(--duration-fast) var(--ease-standard);
web/src/concepts/ConceptCard.module.css:7:  box-shadow: var(--shadow-2);
web/src/concepts/ConceptCard.module.css:17:  box-shadow: var(--shadow-3);
web/src/concepts/ConceptCard.module.css:72:  transition: background-color var(--duration-fast) var(--ease-standard);
web/src/concepts/ConceptOverlay.module.css:24:  box-shadow: var(--shadow-3);
web/src/concepts/ConceptTicker.module.css:11:  transition: bottom var(--duration-standard) var(--ease-standard);
web/src/concepts/ConceptTicker.module.css:20:  transition: transform var(--duration-fast) var(--ease-standard);
web/src/concepts/ConceptsDock.module.css:30:  transition: border-color var(--duration-fast) var(--ease-standard);
web/src/concepts/ConceptsDock.module.css:40:  box-shadow: var(--focus-ring);
web/src/concepts/ConceptsDock.module.css:106:  transition: background-color var(--duration-fast) var(--ease-standard);
web/src/concepts/ConceptsDock.module.css:131:  transition: background-color var(--duration-fast) var(--ease-standard);
web/src/concepts/ConceptsDock.module.css:181:  transition: background-color var(--duration-fast) var(--ease-standard);
web/src/concepts/ConceptsDock.module.css:206:  transition: border-color var(--duration-fast) var(--ease-standard);
web/src/concepts/ConceptsDock.module.css:216:  box-shadow: var(--focus-ring);
web/src/concepts/AnalysisSections.module.css:34:  transition: background-color var(--duration-fast) var(--ease-standard);
web/src/concepts/AnalysisSections.module.css:64:  transition: background-color var(--duration-fast) var(--ease-standard);
web/src/notes/NotationModal.module.css:17:  box-shadow: var(--shadow-3);
web/src/notes/NotationModal.module.css:184:  transition: opacity var(--duration-fast) var(--ease-standard);
web/src/notes/NotationModal.module.css:202:  transition: border-color var(--duration-fast) var(--ease-standard);
web/src/notes/NotationModal.module.css:212:  box-shadow: var(--focus-ring);
web/src/notes/BubbleRail.module.css:48:  transition: border-color var(--duration-fast) var(--ease-standard);
web/src/notes/BubbleRail.module.css:90:  transition: background-color var(--duration-fast) var(--ease-standard);
web/src/notes/BubbleRail.module.css:115:  transition: color var(--duration-fast) var(--ease-standard);
web/src/notes/NotesPane.module.css:24:  transition: background-color var(--duration-fast) var(--ease-standard);
web/src/notes/NotesPane.module.css:72:  transition: border-color var(--duration-fast) var(--ease-standard);
web/src/notes/NotesPane.module.css:82:  box-shadow: var(--focus-ring);
web/src/notes/NotesPane.module.css:118:  transition: background-color var(--duration-fast) var(--ease-standard);
web/src/components/ToastHost.module.css:24:  box-shadow: var(--shadow-3);
web/src/components/TopBar.module.css:25:  transition: background-color var(--duration-fast) var(--ease-standard);
web/src/components/TopBar.module.css:75:  transition: border-color var(--duration-fast) var(--ease-standard);
web/src/components/TopBar.module.css:102:  transition: background-color var(--duration-fast) var(--ease-standard);
web/src/components/TopBar.module.css:122:  box-shadow: var(--shadow-3);
web/src/components/TopBar.module.css:166:  transition: background-color var(--duration-fast) var(--ease-standard);
web/src/components/TopBar.module.css:254:  box-shadow: var(--shadow-3);
web/src/components/TopBar.module.css:274:  transition: background-color var(--duration-fast) var(--ease-standard);
web/src/index.css:164:  box-shadow: var(--focus-ring);
web/src/index.css:243:  transition-duration: 0ms;
web/src/index.css:281:    transition-duration: 1ms !important;
web/src/library/SettingsView.module.css:21:  transition: color var(--duration-fast) var(--ease-standard);
web/src/library/SettingsView.module.css:69:  transition: border-color var(--duration-fast) var(--ease-standard);
web/src/library/SettingsView.module.css:81:  box-shadow: var(--focus-ring);
web/src/library/LibraryView.module.css:17:  transition: border-color var(--duration-fast) var(--ease-standard);
web/src/library/LibraryView.module.css:95:  transition: background-color var(--duration-fast) var(--ease-standard);
web/src/library/LibraryView.module.css:159:  box-shadow: var(--shadow-1);
web/src/library/LibraryView.module.css:245:  box-shadow: var(--shadow-1);
web/src/library/LibraryView.module.css:305:  transition: color var(--duration-fast) var(--ease-standard);
web/src/transcript/TranscriptPane.module.css:24:  transition: border-color var(--duration-fast) var(--ease-standard);
web/src/transcript/TranscriptPane.module.css:34:  box-shadow: var(--focus-ring);
web/src/study/BottomDock.module.css:9:  box-shadow: var(--shadow-1);
web/src/study/BottomDock.module.css:30:  transition: color var(--duration-fast) var(--ease-standard), border-color var(--duration-fast) var(--ease-standard);
web/src/study/RightRail.module.css:11:  box-shadow: var(--shadow-1);
web/src/study/RightRail.module.css:33:  transition: background-color var(--duration-fast) var(--ease-standard);
web/src/study/RightRail.module.css:60:  transition: transform var(--duration-standard) var(--ease-standard);
web/src/study/RightRail.module.css:170:  transition: background-color var(--duration-fast) var(--ease-standard);
web/src/study/RightRail.module.css:200:  box-shadow: var(--shadow-1);
web/src/study/AnalyzeButton.module.css:50:  transition: width var(--duration-standard) var(--ease-standard);
web/src/study/CompileFlow.module.css:59:  box-shadow: var(--shadow-3);
web/src/study/CompileFlow.module.css:74:  box-shadow: var(--shadow-3);
web/src/study/CompileFlow.module.css:156:  transition: background-color var(--duration-fast) var(--ease-standard), color var(--duration-fast) var(--ease-standard);
web/src/study/CompileFlow.module.css:219:  transition: border-color var(--duration-fast) var(--ease-standard);
web/src/study/CompileFlow.module.css:255:  transition: border-color var(--duration-fast) var(--ease-standard);
web/src/study/CompileFlow.module.css:265:  box-shadow: var(--focus-ring);
web/src/study/MarkdownPreview.module.css:53:  box-shadow: var(--shadow-1);
web/src/study/MarkdownPreview.module.css:68:  transition: color var(--duration-fast) var(--ease-standard);
web/src/study/StudyView.module.css:38:  box-shadow: var(--shadow-player);
web/src/study/StudyView.module.css:140:  box-shadow: var(--shadow-3);
web/src/study/StudyView.module.css:193:  transition: background-color var(--duration-fast) var(--ease-standard);
web/src/study/OverlaysToggle.module.css:42:  transition: color var(--duration-fast) var(--ease-standard);

MODAL_PRESENCE
web/src/study/ShareFlow.tsx:17:  if (!currentProject) return null;
web/src/study/ShareFlow.tsx:45:        <div className={styles.overlay} data-state="open" role="presentation" onMouseDown={clearShareResult}>
web/src/study/ShareFlow.tsx:46:          <div className={styles.card} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Exported analysis bundle">
web/src/study/ShareFlow.tsx:17:  if (!currentProject) return null;
web/src/study/ShareFlow.tsx:45:        <div className={styles.overlay} data-state="open" role="presentation" onMouseDown={clearShareResult}>
web/src/study/ShareFlow.tsx:46:          <div className={styles.card} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Exported analysis bundle">
web/src/study/ImportOverlayFlow.tsx:19:  if (!currentProject) return null;
web/src/study/ImportOverlayFlow.tsx:46:          data-state="open"
web/src/study/ImportOverlayFlow.tsx:58:            role="dialog"
web/src/study/ImportOverlayFlow.tsx:59:            aria-modal="true"
web/src/study/CompileFlow.tsx:32:  if (!currentProject) return null;
web/src/study/CompileFlow.tsx:85:        <div className={styles.overlay} data-state="open" role="presentation" onMouseDown={() => !savingCaptions && handleCaptionSkip()}>
web/src/study/CompileFlow.tsx:86:          <div className={styles.card} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Caption these shots?">
web/src/study/CompileFlow.tsx:139:        <div className={styles.overlay} data-state="open" role="presentation" onMouseDown={clearCompileResult}>
web/src/study/CompileFlow.tsx:140:          <div className={styles.previewCard} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Compiled study document">
web/src/notes/NotationModal.tsx:50:  // Reset the draft + autofocus each time the modal transitions closed -> open;
web/src/notes/NotationModal.tsx:51:  // remember the invoking control so focus can be restored on close.
web/src/notes/NotationModal.tsx:56:      const raf = requestAnimationFrame(() => textareaRef.current?.focus());
web/src/notes/NotationModal.tsx:62:      invokerRef.current?.focus?.();
web/src/notes/NotationModal.tsx:77:      if (e.key === "Escape") {
web/src/notes/NotationModal.tsx:82:      // Simple focus trap: keep Tab cycling within the card.
web/src/notes/NotationModal.tsx:84:        const focusable = cardRef.current.querySelectorAll<HTMLElement>(
web/src/notes/NotationModal.tsx:87:        if (focusable.length === 0) return;
web/src/notes/NotationModal.tsx:88:        const first = focusable[0];
web/src/notes/NotationModal.tsx:89:        const last = focusable[focusable.length - 1];
web/src/notes/NotationModal.tsx:92:          last.focus();
web/src/notes/NotationModal.tsx:95:          first.focus();
web/src/notes/NotationModal.tsx:103:  if (!modal || !currentProject) return null;
web/src/notes/NotationModal.tsx:139:    <div className={styles.overlay} data-state="open" role="presentation" onMouseDown={handleBackdropClick}>
web/src/notes/NotationModal.tsx:143:        data-state="open"
web/src/notes/NotationModal.tsx:144:        role="dialog"
web/src/notes/NotationModal.tsx:145:        aria-modal="true"

SEEK_MARKERS
2:// and marker layers rendered purely from props — bubble pins and concept ticks —
32:/** V2-C: one marker from an imported overlay bundle — colored per author handle (SPEC "Overlays"). */
43:  conceptTicks?: SeekBarConceptTick[];
61:  conceptTicks = [],
149:        role="slider"
150:        aria-label="Seek"
164:        {conceptTicks.map((tick) => (
165:          <button
167:            type="button"
168:            className={styles.conceptTick}
169:            data-kind="concept"
171:            aria-label={`Concept: ${tick.title ?? "untitled"} at ${formatTimestamp(tick.t)}`}
180:          <button
182:            type="button"
183:            className={styles.bubblePin}
184:            data-kind="bubble"
186:            aria-label={`Note: ${bubble.text || "untitled"} at ${formatTimestamp(bubble.t)}`}
200:          <button
202:            type="button"
203:            className={styles.pearlMarker}
204:            data-kind="pearl"
207:            aria-label={`Pearl: ${pearl.label} at ${formatTimestamp(pearl.t)}`}
218:        {/* V2-C: imported overlay markers — one colored dot per author handle. */}
219:        {overlayMarkers.map((marker) => (
220:          <button
221:            key={marker.id}
222:            type="button"
223:            className={marker.kind === "pearl" ? styles.overlayPearlMarker : styles.overlayBubbleMarker}
224:            data-kind={`overlay-${marker.kind}`}
225:            style={{ left: pct(marker.t), background: `hsl(${marker.hue}, 70%, 55%)` }}
226:            aria-label={`${marker.handle} — ${formatTimestamp(marker.t)}`}
227:            title={`${marker.handle} — ${formatTimestamp(marker.t)}`}
230:              onSeek(Math.max(0, marker.t - 5));

exec
/bin/zsh -lc "sips -g pixelWidth -g pixelHeight design/*.png 2>/dev/null; printf '\\nSTUDY_LAYOUT\\n'; nl -ba web/src/study/StudyView.module.css | sed -n '1,250p'; printf '\\nTOPBAR\\n'; nl -ba web/src/components/TopBar.module.css | sed -n '1,330p'; printf '\\nMODAL_CSS\\n'; nl -ba web/src/notes/NotationModal.module.css | sed -n '1,270p'; printf '\\nRAIL_CSS\\n'; nl -ba web/src/study/RightRail.module.css | sed -n '1,260p'" in /Users/antemo/studyloop
 succeeded in 0ms:
/Users/antemo/studyloop/design/reference-youtube.png
  pixelWidth: 1896
  pixelHeight: 967
/Users/antemo/studyloop/design/v2-a-home.png
  pixelWidth: 1440
  pixelHeight: 900
/Users/antemo/studyloop/design/v2-a-watch.png
  pixelWidth: 1440
  pixelHeight: 900
/Users/antemo/studyloop/design/v2-b-upnext.png
  pixelWidth: 1440
  pixelHeight: 900
/Users/antemo/studyloop/design/v2-c-analysis.png
  pixelWidth: 1440
  pixelHeight: 900
/Users/antemo/studyloop/design/v2-d-home.png
  pixelWidth: 1280
  pixelHeight: 800
/Users/antemo/studyloop/design/v2-d-modal.png
  pixelWidth: 1280
  pixelHeight: 800
/Users/antemo/studyloop/design/v2-d-rail.png
  pixelWidth: 1280
  pixelHeight: 800
/Users/antemo/studyloop/design/v2-d-watch.png
  pixelWidth: 1280
  pixelHeight: 800

STUDY_LAYOUT
     1	.page {
     2	  min-height: calc(100vh - var(--topbar-height));
     3	}
     4	
     5	.status {
     6	  padding: 40px;
     7	  color: var(--text-secondary);
     8	  font-size: var(--type-14);
     9	}
    10	
    11	.watchGrid {
    12	  display: flex;
    13	  align-items: flex-start;
    14	  gap: 24px;
    15	  max-width: 1750px;
    16	  margin: 0 auto;
    17	  padding: 20px 24px 64px;
    18	}
    19	
    20	.leftCol {
    21	  flex: 1;
    22	  min-width: 0;
    23	  display: flex;
    24	  flex-direction: column;
    25	}
    26	
    27	.rightCol {
    28	  width: 402px;
    29	  flex-shrink: 0;
    30	}
    31	
    32	.playerFrame {
    33	  position: relative;
    34	  width: 100%;
    35	  aspect-ratio: 16 / 9;
    36	  background: var(--surface-player);
    37	  border-radius: var(--radius-md);
    38	  box-shadow: var(--shadow-player);
    39	  overflow: hidden;
    40	}
    41	
    42	.playerFrame:fullscreen {
    43	  border-radius: 0;
    44	}
    45	
    46	.title {
    47	  font-size: var(--type-20);
    48	  font-weight: var(--weight-bold);
    49	  letter-spacing: -0.01em;
    50	  line-height: 1.4;
    51	  margin: 14px 0 0;
    52	  color: var(--text-primary);
    53	  text-wrap: pretty;
    54	}
    55	
    56	.channelRow {
    57	  display: flex;
    58	  align-items: center;
    59	  justify-content: space-between;
    60	  gap: 12px;
    61	  margin-top: 12px;
    62	  padding-bottom: 14px;
    63	  border-bottom: 1px solid var(--border-hairline);
    64	}
    65	
    66	.channelIdentity {
    67	  display: flex;
    68	  align-items: center;
    69	  gap: 10px;
    70	  min-width: 0;
    71	}
    72	
    73	.avatar {
    74	  width: 40px;
    75	  height: 40px;
    76	  border-radius: 50%;
    77	  background: var(--surface-popover);
    78	  color: var(--text-primary);
    79	  display: flex;
    80	  align-items: center;
    81	  justify-content: center;
    82	  font-size: var(--type-16);
    83	  font-weight: var(--weight-bold);
    84	  flex-shrink: 0;
    85	}
    86	
    87	.channelText {
    88	  display: flex;
    89	  flex-direction: column;
    90	  min-width: 0;
    91	}
    92	
    93	.channelName {
    94	  font-size: var(--type-14);
    95	  font-weight: var(--weight-medium);
    96	  color: var(--text-primary);
    97	}
    98	
    99	.channelSource {
   100	  font-size: var(--type-12);
   101	  color: var(--text-secondary);
   102	  overflow: hidden;
   103	  text-overflow: ellipsis;
   104	  white-space: nowrap;
   105	  max-width: 420px;
   106	}
   107	
   108	.actionPills {
   109	  display: flex;
   110	  align-items: center;
   111	  gap: 8px;
   112	  flex-wrap: wrap;
   113	  margin-top: 14px;
   114	}
   115	
   116	.descriptionBox {
   117	  margin-top: 16px;
   118	}
   119	
   120	.resumeOverlay {
   121	  position: absolute;
   122	  inset: 0;
   123	  background: var(--surface-scrim);
   124	  display: flex;
   125	  align-items: center;
   126	  justify-content: center;
   127	  z-index: 20;
   128	  animation: backdrop-in var(--duration-standard) var(--ease-enter) both;
   129	}
   130	
   131	@keyframes backdrop-in {
   132	  from { opacity: 0; }
   133	  to { opacity: 1; }
   134	}
   135	
   136	.resumeCard {
   137	  background: var(--surface-overlay);
   138	  border: 1px solid var(--border-hairline);
   139	  border-radius: var(--radius-md);
   140	  box-shadow: var(--shadow-3);
   141	  padding: 20px 24px;
   142	  text-align: center;
   143	  animation: modal-in var(--duration-modal) var(--ease-enter) both;
   144	}
   145	
   146	@keyframes modal-in {
   147	  from { opacity: 0; transform: translateY(12px) scale(.98); }
   148	  to { opacity: 1; transform: none; }
   149	}
   150	
   151	.resumeCard p {
   152	  margin: 0 0 14px;
   153	  font-size: var(--type-14);
   154	  color: var(--text-primary);
   155	}
   156	
   157	.resumeActions {
   158	  display: flex;
   159	  gap: 8px;
   160	  justify-content: center;
   161	}
   162	
   163	.primaryButton {
   164	  background: var(--accent-blue);
   165	  color: var(--surface-bg);
   166	  border: none;
   167	  border-radius: var(--radius-pill);
   168	  padding: 8px 16px;
   169	  font-size: var(--type-13);
   170	  font-weight: var(--weight-bold);
   171	  cursor: pointer;
   172	  transition:
   173	    background-color var(--duration-fast) var(--ease-standard),
   174	    transform var(--duration-press) var(--ease-standard);
   175	}
   176	
   177	.primaryButton:hover {
   178	  background: color-mix(in srgb, var(--accent-blue) 85%, white);
   179	}
   180	
   181	.primaryButton:active {
   182	  transform: scale(.98);
   183	}
   184	
   185	.secondaryButton {
   186	  background: transparent;
   187	  border: 1px solid var(--border-default);
   188	  color: var(--text-primary);
   189	  border-radius: var(--radius-pill);
   190	  padding: 8px 16px;
   191	  font-size: var(--type-13);
   192	  cursor: pointer;
   193	  transition: background-color var(--duration-fast) var(--ease-standard);
   194	}
   195	
   196	.secondaryButton:hover {
   197	  background: var(--hover-overlay);
   198	}
   199	
   200	@media (max-width: 1100px) {
   201	  .watchGrid {
   202	    flex-direction: column;
   203	  }
   204	
   205	  .rightCol {
   206	    width: 100%;
   207	  }
   208	}

TOPBAR
     1	.topbar {
     2	  position: sticky;
     3	  top: 0;
     4	  z-index: 200;
     5	  height: var(--topbar-height);
     6	  display: flex;
     7	  align-items: center;
     8	  gap: 16px;
     9	  padding: 0 16px;
    10	  background: var(--surface-bg);
    11	  border-bottom: 1px solid var(--border-hairline);
    12	}
    13	
    14	.wordmark {
    15	  display: flex;
    16	  align-items: center;
    17	  gap: 8px;
    18	  background: transparent;
    19	  border: none;
    20	  color: var(--text-primary);
    21	  cursor: pointer;
    22	  padding: 6px 4px;
    23	  border-radius: var(--radius-sm);
    24	  flex-shrink: 0;
    25	  transition: background-color var(--duration-fast) var(--ease-standard);
    26	}
    27	
    28	.wordmark:hover {
    29	  background: var(--hover-overlay);
    30	}
    31	
    32	.logoMark {
    33	  width: 30px;
    34	  height: 30px;
    35	  border-radius: var(--radius-sm);
    36	  background: var(--accent-red);
    37	  color: #fff;
    38	  display: flex;
    39	  align-items: center;
    40	  justify-content: center;
    41	  flex-shrink: 0;
    42	}
    43	
    44	.logoText {
    45	  font-size: var(--type-18);
    46	  font-weight: var(--weight-bold);
    47	  letter-spacing: -0.01em;
    48	  white-space: nowrap;
    49	}
    50	
    51	.searchWrap {
    52	  position: relative;
    53	  flex: 1;
    54	  display: flex;
    55	  justify-content: center;
    56	  min-width: 0;
    57	}
    58	
    59	.searchForm {
    60	  display: flex;
    61	  width: 100%;
    62	  max-width: 560px;
    63	}
    64	
    65	.searchInput {
    66	  flex: 1;
    67	  min-width: 0;
    68	  background: var(--surface-bg);
    69	  border: 1px solid var(--border-default);
    70	  border-right: none;
    71	  color: var(--text-primary);
    72	  border-radius: var(--radius-pill) 0 0 var(--radius-pill);
    73	  padding: 8px 16px;
    74	  font-size: var(--type-14);
    75	  transition: border-color var(--duration-fast) var(--ease-standard);
    76	}
    77	
    78	.searchInput:hover {
    79	  border-color: var(--border-strong);
    80	}
    81	
    82	.searchInput:focus {
    83	  outline: none;
    84	  border-color: var(--accent-blue);
    85	}
    86	
    87	.searchInput::placeholder {
    88	  color: var(--text-tertiary);
    89	}
    90	
    91	.searchButton {
    92	  flex-shrink: 0;
    93	  width: 56px;
    94	  display: flex;
    95	  align-items: center;
    96	  justify-content: center;
    97	  background: var(--surface-popover);
    98	  border: 1px solid var(--border-default);
    99	  color: var(--text-primary);
   100	  border-radius: 0 var(--radius-pill) var(--radius-pill) 0;
   101	  cursor: pointer;
   102	  transition: background-color var(--duration-fast) var(--ease-standard);
   103	}
   104	
   105	.searchButton:hover {
   106	  background: var(--surface-hover);
   107	}
   108	
   109	.searchButton:active {
   110	  transform: scale(.96);
   111	}
   112	
   113	.dropdown {
   114	  position: absolute;
   115	  top: calc(100% + 6px);
   116	  left: 50%;
   117	  transform: translateX(-50%);
   118	  width: min(560px, 90vw);
   119	  background: var(--surface-popover);
   120	  border: 1px solid var(--border-hairline);
   121	  border-radius: var(--radius-md);
   122	  box-shadow: var(--shadow-3);
   123	  padding: 8px 0;
   124	  max-height: 60vh;
   125	  overflow-y: auto;
   126	  animation: dropdown-in var(--duration-fast) var(--ease-enter) both;
   127	}
   128	
   129	@keyframes dropdown-in {
   130	  from { opacity: 0; transform: translate(-50%, -4px); }
   131	  to { opacity: 1; transform: translate(-50%, 0); }
   132	}
   133	
   134	.dropdownSection + .dropdownSection {
   135	  border-top: 1px solid var(--border-hairline);
   136	  margin-top: 6px;
   137	  padding-top: 6px;
   138	}
   139	
   140	.dropdownLabel {
   141	  font-size: var(--type-11);
   142	  font-weight: var(--weight-medium);
   143	  text-transform: uppercase;
   144	  letter-spacing: .06em;
   145	  color: var(--text-tertiary);
   146	  padding: 6px 16px;
   147	}
   148	
   149	.dropdownEmpty {
   150	  padding: 8px 16px 12px;
   151	  font-size: var(--type-13);
   152	  color: var(--text-secondary);
   153	}
   154	
   155	.dropdownItem {
   156	  display: flex;
   157	  align-items: center;
   158	  gap: 10px;
   159	  width: 100%;
   160	  background: transparent;
   161	  border: none;
   162	  color: var(--text-primary);
   163	  text-align: left;
   164	  padding: 8px 16px;
   165	  cursor: pointer;
   166	  transition: background-color var(--duration-fast) var(--ease-standard);
   167	}
   168	
   169	.dropdownItem:hover:not(:disabled),
   170	.dropdownItemActive {
   171	  background: var(--hover-overlay);
   172	}
   173	
   174	.dropdownItem:disabled {
   175	  opacity: 0.5;
   176	  cursor: default;
   177	}
   178	
   179	.dropdownItemThumb {
   180	  width: 44px;
   181	  height: 25px;
   182	  border-radius: var(--radius-xs);
   183	  background: var(--surface-raised);
   184	  display: flex;
   185	  align-items: center;
   186	  justify-content: center;
   187	  flex-shrink: 0;
   188	  color: var(--text-secondary);
   189	  overflow: hidden;
   190	}
   191	
   192	.dropdownItemThumbImg {
   193	  width: 100%;
   194	  height: 100%;
   195	  object-fit: cover;
   196	}
   197	
   198	.dropdownItemBody {
   199	  display: flex;
   200	  flex-direction: column;
   201	  gap: 2px;
   202	  min-width: 0;
   203	}
   204	
   205	.dropdownItemTitle {
   206	  font-size: var(--type-13);
   207	  overflow: hidden;
   208	  text-overflow: ellipsis;
   209	  white-space: nowrap;
   210	}
   211	
   212	.dropdownItemMeta {
   213	  font-size: var(--type-11);
   214	  color: var(--text-secondary);
   215	}
   216	
   217	.menuWrap {
   218	  position: relative;
   219	  flex-shrink: 0;
   220	}
   221	
   222	.avatarButton {
   223	  width: 36px;
   224	  height: 36px;
   225	  border-radius: 50%;
   226	  background: var(--surface-popover);
   227	  border: 1px solid var(--border-hairline);
   228	  color: var(--text-primary);
   229	  cursor: pointer;
   230	  display: flex;
   231	  align-items: center;
   232	  justify-content: center;
   233	  transition:
   234	    background-color var(--duration-fast) var(--ease-standard),
   235	    transform var(--duration-press) var(--ease-standard);
   236	}
   237	
   238	.avatarButton:hover {
   239	  background: var(--surface-hover);
   240	}
   241	
   242	.avatarButton:active {
   243	  transform: scale(.94);
   244	}
   245	
   246	.menu {
   247	  position: absolute;
   248	  top: calc(100% + 8px);
   249	  right: 0;
   250	  min-width: 180px;
   251	  background: var(--surface-popover);
   252	  border: 1px solid var(--border-hairline);
   253	  border-radius: var(--radius-md);
   254	  box-shadow: var(--shadow-3);
   255	  padding: 6px;
   256	  display: flex;
   257	  flex-direction: column;
   258	  gap: 2px;
   259	  animation: dropdown-in var(--duration-fast) var(--ease-enter) both;
   260	}
   261	
   262	.menuItem {
   263	  display: flex;
   264	  align-items: center;
   265	  gap: 10px;
   266	  background: transparent;
   267	  border: none;
   268	  color: var(--text-primary);
   269	  text-align: left;
   270	  padding: 10px 12px;
   271	  border-radius: var(--radius-sm);
   272	  font-size: var(--type-13);
   273	  cursor: pointer;
   274	  transition: background-color var(--duration-fast) var(--ease-standard);
   275	}
   276	
   277	.menuItem:hover {
   278	  background: var(--hover-overlay);
   279	}

MODAL_CSS
     1	.overlay {
     2	  position: fixed;
     3	  inset: 0;
     4	  background: var(--surface-scrim);
     5	  display: flex;
     6	  align-items: center;
     7	  justify-content: center;
     8	  z-index: 100;
     9	  padding: 24px;
    10	  animation: backdrop-in var(--duration-standard) var(--ease-enter) both;
    11	}
    12	
    13	.card {
    14	  background: var(--surface-overlay);
    15	  border: 1px solid var(--border-hairline);
    16	  border-radius: var(--radius-lg);
    17	  box-shadow: var(--shadow-3);
    18	  width: min(640px, calc(100vw - 32px));
    19	  max-height: min(560px, calc(100vh - 48px));
    20	  display: flex;
    21	  flex-direction: column;
    22	  overflow: hidden;
    23	  animation: modal-in var(--duration-modal) var(--ease-enter) both;
    24	}
    25	
    26	@keyframes backdrop-in {
    27	  from { opacity: 0; }
    28	  to { opacity: 1; }
    29	}
    30	
    31	@keyframes modal-in {
    32	  from { opacity: 0; transform: translateY(12px) scale(.98); }
    33	  to { opacity: 1; transform: none; }
    34	}
    35	
    36	.header {
    37	  display: flex;
    38	  align-items: flex-start;
    39	  justify-content: space-between;
    40	  gap: 12px;
    41	  padding: 16px 16px 12px;
    42	  border-bottom: 1px solid var(--border-hairline);
    43	}
    44	
    45	.headerText {
    46	  display: flex;
    47	  flex-direction: column;
    48	  gap: 2px;
    49	  min-width: 0;
    50	}
    51	
    52	.title {
    53	  margin: 0;
    54	  font-size: var(--type-18);
    55	  font-weight: var(--weight-bold);
    56	  color: var(--text-primary);
    57	}
    58	
    59	.timestamp {
    60	  font-variant-numeric: tabular-nums;
    61	  font-size: var(--type-13);
    62	  color: var(--text-secondary);
    63	}
    64	
    65	.closeButton {
    66	  flex-shrink: 0;
    67	  width: 32px;
    68	  height: 32px;
    69	  display: flex;
    70	  align-items: center;
    71	  justify-content: center;
    72	  background: transparent;
    73	  border: none;
    74	  border-radius: 50%;
    75	  color: var(--text-secondary);
    76	  cursor: pointer;
    77	  transition:
    78	    background-color var(--duration-fast) var(--ease-standard),
    79	    color var(--duration-fast) var(--ease-standard),
    80	    transform var(--duration-press) var(--ease-standard);
    81	}
    82	
    83	.closeButton:hover {
    84	  background: var(--hover-overlay);
    85	  color: var(--text-primary);
    86	}
    87	
    88	.closeButton:active {
    89	  transform: scale(.94);
    90	}
    91	
    92	.content {
    93	  flex: 1;
    94	  min-height: 0;
    95	  display: flex;
    96	  overflow: auto;
    97	}
    98	
    99	.thumb {
   100	  width: 220px;
   101	  flex-shrink: 0;
   102	  background: var(--surface-player);
   103	  display: flex;
   104	  align-items: center;
   105	  justify-content: center;
   106	}
   107	
   108	.thumbImg {
   109	  width: 100%;
   110	  height: 100%;
   111	  object-fit: cover;
   112	  display: block;
   113	}
   114	
   115	.noFrame {
   116	  color: var(--text-secondary);
   117	  font-size: var(--type-12);
   118	}
   119	
   120	.spinner {
   121	  width: 22px;
   122	  height: 22px;
   123	  border-radius: 50%;
   124	  border: 2px solid var(--border-default);
   125	  border-top-color: var(--accent-blue);
   126	  animation: spin 800ms linear infinite;
   127	}
   128	
   129	.fields {
   130	  flex: 1;
   131	  min-width: 0;
   132	  display: flex;
   133	  flex-direction: column;
   134	  padding: 16px;
   135	  gap: 10px;
   136	}
   137	
   138	.quote {
   139	  display: flex;
   140	  align-items: flex-start;
   141	  gap: 8px;
   142	  background: var(--surface-bg);
   143	  border: 1px solid var(--border-hairline);
   144	  border-radius: var(--radius-sm);
   145	  padding: 8px 10px;
   146	  font-size: var(--type-13);
   147	  color: var(--text-secondary);
   148	  font-style: italic;
   149	}
   150	
   151	.conceptChip {
   152	  display: flex;
   153	  align-items: center;
   154	  gap: 8px;
   155	  align-self: flex-start;
   156	  background: color-mix(in srgb, var(--accent-green) 14%, transparent);
   157	  border: 1px solid color-mix(in srgb, var(--accent-green) 40%, transparent);
   158	  border-radius: var(--radius-pill);
   159	  padding: 3px 6px 3px 10px;
   160	  font-size: var(--type-12);
   161	  color: var(--accent-green);
   162	}
   163	
   164	.conceptChipText {
   165	  white-space: nowrap;
   166	  overflow: hidden;
   167	  text-overflow: ellipsis;
   168	}
   169	
   170	.quoteText {
   171	  flex: 1;
   172	  line-height: 1.4;
   173	}
   174	
   175	.quoteRemove {
   176	  background: transparent;
   177	  border: none;
   178	  color: currentColor;
   179	  opacity: .7;
   180	  cursor: pointer;
   181	  line-height: 1;
   182	  flex-shrink: 0;
   183	  display: inline-flex;
   184	  transition: opacity var(--duration-fast) var(--ease-standard);
   185	}
   186	
   187	.quoteRemove:hover {
   188	  opacity: 1;
   189	}
   190	
   191	.textarea {
   192	  flex: 1;
   193	  min-height: 100px;
   194	  resize: vertical;
   195	  background: var(--surface-bg);
   196	  border: 1px solid var(--border-default);
   197	  color: var(--text-primary);
   198	  border-radius: var(--radius-sm);
   199	  padding: 10px 12px;
   200	  font-size: var(--type-14);
   201	  font-family: inherit;
   202	  transition: border-color var(--duration-fast) var(--ease-standard);
   203	}
   204	
   205	.textarea:hover {
   206	  border-color: var(--border-strong);
   207	}
   208	
   209	.textarea:focus-visible {
   210	  outline: none;
   211	  border-color: var(--accent-blue);
   212	  box-shadow: var(--focus-ring);
   213	}
   214	
   215	.textarea::placeholder {
   216	  color: var(--text-tertiary);
   217	}
   218	
   219	.actions {
   220	  display: flex;
   221	  justify-content: flex-end;
   222	  gap: 8px;
   223	  padding: 12px 16px;
   224	  border-top: 1px solid var(--border-hairline);
   225	  background: var(--surface-raised);
   226	}
   227	
   228	.primaryButton {
   229	  display: inline-flex;
   230	  align-items: center;
   231	  gap: 6px;
   232	  background: var(--accent-blue);
   233	  color: var(--surface-bg);
   234	  border: none;
   235	  border-radius: var(--radius-pill);
   236	  padding: 8px 16px;
   237	  font-size: var(--type-13);
   238	  font-weight: var(--weight-bold);
   239	  cursor: pointer;
   240	  min-width: 76px;
   241	  justify-content: center;
   242	  transition:
   243	    background-color var(--duration-fast) var(--ease-standard),
   244	    transform var(--duration-press) var(--ease-standard);
   245	}
   246	
   247	.primaryButton:hover:not(:disabled) {
   248	  background: color-mix(in srgb, var(--accent-blue) 85%, white);
   249	}
   250	
   251	.primaryButton:active:not(:disabled) {
   252	  transform: scale(.98);
   253	}
   254	
   255	.primaryButton:disabled {
   256	  opacity: 0.6;
   257	  cursor: default;
   258	}
   259	
   260	.buttonSpinner {
   261	  width: 12px;
   262	  height: 12px;
   263	  border-radius: 50%;
   264	  border: 2px solid color-mix(in srgb, var(--surface-bg) 40%, transparent);
   265	  border-top-color: var(--surface-bg);
   266	  animation: spin 700ms linear infinite;
   267	}
   268	
   269	.secondaryButton {
   270	  background: transparent;

RAIL_CSS
     1	.rail {
     2	  display: flex;
     3	  flex-direction: column;
     4	  gap: 10px;
     5	}
     6	
     7	.card {
     8	  background: var(--surface-raised);
     9	  border: 1px solid var(--border-hairline);
    10	  border-radius: var(--radius-md);
    11	  box-shadow: var(--shadow-1);
    12	  overflow: hidden;
    13	}
    14	
    15	.cardHeaderRow {
    16	  display: flex;
    17	  align-items: center;
    18	}
    19	
    20	.cardHeader {
    21	  flex: 1;
    22	  display: flex;
    23	  align-items: center;
    24	  justify-content: space-between;
    25	  background: transparent;
    26	  border: none;
    27	  color: var(--text-primary);
    28	  padding: 12px 14px;
    29	  cursor: pointer;
    30	  font-size: var(--type-14);
    31	  font-weight: var(--weight-medium);
    32	  min-width: 0;
    33	  transition: background-color var(--duration-fast) var(--ease-standard);
    34	}
    35	
    36	.cardHeader:hover {
    37	  background: rgb(255 255 255 / 6%);
    38	}
    39	
    40	.cardHeader:active {
    41	  background: rgb(255 255 255 / 10%);
    42	}
    43	
    44	.cardHeaderStatic {
    45	  flex: 1;
    46	  padding: 12px 14px;
    47	  font-size: var(--type-14);
    48	  font-weight: var(--weight-medium);
    49	  min-width: 0;
    50	}
    51	
    52	.cardTitle {
    53	  font-size: var(--type-14);
    54	  font-weight: var(--weight-medium);
    55	}
    56	
    57	.chevron {
    58	  display: inline-flex;
    59	  color: var(--text-secondary);
    60	  transition: transform var(--duration-standard) var(--ease-standard);
    61	}
    62	
    63	.chevron[data-open="true"] {
    64	  transform: rotate(180deg);
    65	}
    66	
    67	.expandRegion {
    68	  display: grid;
    69	  grid-template-rows: 0fr;
    70	  opacity: 0;
    71	  transition:
    72	    grid-template-rows var(--duration-panel) var(--ease-standard),
    73	    opacity var(--duration-standard) var(--ease-standard);
    74	}
    75	
    76	.expandRegion[data-open="true"] {
    77	  grid-template-rows: 1fr;
    78	  opacity: 1;
    79	}
    80	
    81	.expandInner {
    82	  min-height: 0;
    83	  overflow: hidden;
    84	}
    85	
    86	.cardBody {
    87	  border-top: 1px solid var(--border-hairline);
    88	  padding: 10px;
    89	}
    90	
    91	.transcriptViewport {
    92	  height: 420px;
    93	  min-height: 0;
    94	}
    95	
    96	.conceptsViewport {
    97	  max-height: 420px;
    98	  min-height: 0;
    99	  display: flex;
   100	  flex-direction: column;
   101	}
   102	
   103	.tickerMuteButton {
   104	  flex-shrink: 0;
   105	  margin-right: 10px;
   106	  background: transparent;
   107	  border: 1px solid var(--border-default);
   108	  color: var(--text-secondary);
   109	  border-radius: var(--radius-pill);
   110	  width: 28px;
   111	  height: 28px;
   112	  display: inline-flex;
   113	  align-items: center;
   114	  justify-content: center;
   115	  cursor: pointer;
   116	  transition:
   117	    background-color var(--duration-fast) var(--ease-standard),
   118	    color var(--duration-fast) var(--ease-standard),
   119	    transform var(--duration-press) var(--ease-standard);
   120	}
   121	
   122	.tickerMuteButton:hover:not(:disabled) {
   123	  background: var(--hover-overlay);
   124	  color: var(--text-primary);
   125	}
   126	
   127	.tickerMuteButton:active:not(:disabled) {
   128	  transform: scale(.94);
   129	}
   130	
   131	.tickerMuteButton:disabled {
   132	  opacity: 0.5;
   133	  cursor: default;
   134	}
   135	
   136	.spinning svg {
   137	  animation: rail-spin 900ms linear infinite;
   138	}
   139	
   140	@keyframes rail-spin {
   141	  to { transform: rotate(360deg); }
   142	}
   143	
   144	.upNextEmpty {
   145	  padding: 0 14px 16px;
   146	  font-size: var(--type-12);
   147	  color: var(--text-secondary);
   148	  line-height: 1.5;
   149	}
   150	
   151	.upNextList {
   152	  display: flex;
   153	  flex-direction: column;
   154	  gap: 8px;
   155	  padding: 0 10px 12px;
   156	}
   157	
   158	.upNextCard {
   159	  display: flex;
   160	  align-items: flex-start;
   161	  gap: 8px;
   162	  width: 100%;
   163	  background: transparent;
   164	  border: none;
   165	  border-radius: var(--radius-sm);
   166	  padding: 4px;
   167	  text-align: left;
   168	  color: var(--text-primary);
   169	  cursor: pointer;
   170	  transition: background-color var(--duration-fast) var(--ease-standard);
   171	}
   172	
   173	.upNextCard:hover:not(:disabled),
   174	.upNextCard:focus-visible {
   175	  background: var(--hover-overlay);
   176	}
   177	
   178	.upNextCard:hover:not(:disabled) .upNextThumbImg,
   179	.upNextCard:focus-visible .upNextThumbImg {
   180	  filter: brightness(1.08);
   181	  transform: translateY(-1px);
   182	}
   183	
   184	.upNextCard:disabled {
   185	  opacity: 0.6;
   186	  cursor: default;
   187	}
   188	
   189	.upNextThumb {
   190	  position: relative;
   191	  width: 168px;
   192	  height: 94px;
   193	  border-radius: var(--radius-sm);
   194	  background: var(--surface-popover);
   195	  flex-shrink: 0;
   196	  overflow: hidden;
   197	  display: flex;
   198	  align-items: center;
   199	  justify-content: center;
   200	  box-shadow: var(--shadow-1);
   201	}
   202	
   203	.upNextThumbImg {
   204	  width: 100%;
   205	  height: 100%;
   206	  object-fit: cover;
   207	  transition:
   208	    filter var(--duration-fast) var(--ease-standard),
   209	    transform var(--duration-fast) var(--ease-standard);
   210	}
   211	
   212	.upNextThumbGlyph {
   213	  color: var(--text-secondary);
   214	  display: inline-flex;
   215	}
   216	
   217	.upNextDuration {
   218	  position: absolute;
   219	  right: 4px;
   220	  bottom: 4px;
   221	  background: rgb(0 0 0 / 80%);
   222	  color: #fff;
   223	  font-size: var(--type-11);
   224	  font-weight: var(--weight-bold);
   225	  padding: 1px 4px;
   226	  border-radius: var(--radius-xs);
   227	  font-variant-numeric: tabular-nums;
   228	}
   229	
   230	.upNextOverlay {
   231	  position: absolute;
   232	  inset: 0;
   233	  background: rgb(0 0 0 / 55%);
   234	  color: #fff;
   235	  font-size: var(--type-11);
   236	  display: flex;
   237	  align-items: center;
   238	  justify-content: center;
   239	}
   240	
   241	.upNextBody {
   242	  display: flex;
   243	  flex-direction: column;
   244	  gap: 2px;
   245	  min-width: 0;
   246	  padding-top: 2px;
   247	}
   248	
   249	.upNextTitle {
   250	  font-size: var(--type-13);
   251	  font-weight: var(--weight-medium);
   252	  line-height: 1.3;
   253	  display: -webkit-box;
   254	  -webkit-line-clamp: 2;
   255	  -webkit-box-orient: vertical;
   256	  overflow: hidden;
   257	}
   258	
   259	.upNextCard:hover .upNextTitle,
   260	.upNextCard:focus-visible .upNextTitle {

2026-07-28T23:35:36.869968Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 87 column 5
exec
/bin/zsh -lc "printf 'LIBRARY_CSS\\n'; nl -ba web/src/library/LibraryView.module.css | sed -n '1,380p'; printf '\\nCONCEPTS_DOCK_CSS\\n'; nl -ba web/src/concepts/ConceptsDock.module.css | sed -n '1,280p'; printf '\\nANALYSIS_CSS\\n'; nl -ba web/src/concepts/AnalysisSections.module.css | sed -n '1,140p'; printf '\\nNOTATION_TSX\\n'; nl -ba web/src/notes/NotationModal.tsx | sed -n '40,250p'; printf '\\nCOMPILE_CSS_HEAD\\n'; nl -ba web/src/study/CompileFlow.module.css | sed -n '1,110p'; printf '\\nDIFF_HARDCODED\\n'; git diff 8b339d5"'^ 8b339d5 -- web/src/player/SeekBar.module.css web/src/notes/NotationModal.module.css web/src/study/CompileFlow.module.css | rg -n '"'"'^'"\\+.*(box-shadow|transition|animation).*(ms|[0-9]+s|0 0)' || true" in /Users/antemo/studyloop
 succeeded in 0ms:
LIBRARY_CSS
     1	.page {
     2	  max-width: 1750px;
     3	  margin: 0 auto;
     4	  padding: 20px 24px 64px;
     5	}
     6	
     7	.youtubeBar {
     8	  display: flex;
     9	  align-items: center;
    10	  gap: 8px;
    11	  max-width: 640px;
    12	  margin: 0 auto 20px;
    13	  background: var(--surface-raised);
    14	  border: 1px solid var(--border-hairline);
    15	  border-radius: var(--radius-pill);
    16	  padding: 4px 6px 4px 14px;
    17	  transition: border-color var(--duration-fast) var(--ease-standard);
    18	}
    19	
    20	.youtubeBar:focus-within {
    21	  border-color: var(--border-strong);
    22	}
    23	
    24	.youtubeBarIcon {
    25	  display: inline-flex;
    26	  color: var(--text-secondary);
    27	  flex-shrink: 0;
    28	}
    29	
    30	.youtubeInput {
    31	  flex: 1;
    32	  background: transparent;
    33	  border: none;
    34	  color: var(--text-primary);
    35	  padding: 8px 4px;
    36	  font-size: var(--type-13);
    37	}
    38	
    39	.youtubeInput:focus {
    40	  outline: none;
    41	}
    42	
    43	.youtubeInput::placeholder {
    44	  color: var(--text-tertiary);
    45	}
    46	
    47	.youtubeSubmit {
    48	  background: var(--accent-blue);
    49	  color: var(--surface-bg);
    50	  border: none;
    51	  border-radius: var(--radius-pill);
    52	  padding: 8px 16px;
    53	  font-size: var(--type-12);
    54	  font-weight: var(--weight-bold);
    55	  cursor: pointer;
    56	  white-space: nowrap;
    57	  transition:
    58	    background-color var(--duration-fast) var(--ease-standard),
    59	    transform var(--duration-press) var(--ease-standard);
    60	}
    61	
    62	.youtubeSubmit:hover:not(:disabled) {
    63	  background: color-mix(in srgb, var(--accent-blue) 85%, white);
    64	}
    65	
    66	.youtubeSubmit:active:not(:disabled) {
    67	  transform: scale(.97);
    68	}
    69	
    70	.youtubeSubmit:disabled {
    71	  opacity: 0.5;
    72	  cursor: default;
    73	}
    74	
    75	.toolbar {
    76	  display: flex;
    77	  align-items: center;
    78	  justify-content: space-between;
    79	  margin-bottom: 16px;
    80	}
    81	
    82	.toolbarCount {
    83	  font-size: var(--type-13);
    84	  color: var(--text-secondary);
    85	}
    86	
    87	.secondaryButton {
    88	  background: var(--surface-popover);
    89	  color: var(--text-primary);
    90	  border: 1px solid var(--border-hairline);
    91	  border-radius: var(--radius-pill);
    92	  padding: 7px 14px;
    93	  font-size: var(--type-12);
    94	  cursor: pointer;
    95	  transition: background-color var(--duration-fast) var(--ease-standard);
    96	}
    97	
    98	.secondaryButton:hover:not(:disabled) {
    99	  background: var(--surface-hover);
   100	}
   101	
   102	.secondaryButton:active:not(:disabled) {
   103	  transform: scale(.98);
   104	}
   105	
   106	.secondaryButton:disabled {
   107	  opacity: 0.6;
   108	  cursor: default;
   109	}
   110	
   111	.primaryButton {
   112	  background: var(--accent-blue);
   113	  color: var(--surface-bg);
   114	  border: none;
   115	  border-radius: var(--radius-pill);
   116	  padding: 8px 16px;
   117	  font-size: var(--type-13);
   118	  font-weight: var(--weight-bold);
   119	  cursor: pointer;
   120	  transition:
   121	    background-color var(--duration-fast) var(--ease-standard),
   122	    transform var(--duration-press) var(--ease-standard);
   123	}
   124	
   125	.primaryButton:hover {
   126	  background: color-mix(in srgb, var(--accent-blue) 85%, white);
   127	}
   128	
   129	.primaryButton:active {
   130	  transform: scale(.98);
   131	}
   132	
   133	.warnings {
   134	  margin-bottom: 20px;
   135	  display: flex;
   136	  flex-direction: column;
   137	  gap: 6px;
   138	}
   139	
   140	.warning {
   141	  font-size: var(--type-12);
   142	  color: var(--accent-amber);
   143	  background: color-mix(in srgb, var(--accent-amber) 12%, transparent);
   144	  border: 1px solid color-mix(in srgb, var(--accent-amber) 40%, transparent);
   145	  border-radius: var(--radius-sm);
   146	  padding: 6px 10px;
   147	}
   148	
   149	.status {
   150	  color: var(--text-secondary);
   151	  font-size: var(--type-14);
   152	  padding: 32px 0;
   153	}
   154	
   155	.emptyCard {
   156	  border: 1px solid var(--border-hairline);
   157	  background: var(--surface-raised);
   158	  border-radius: var(--radius-md);
   159	  box-shadow: var(--shadow-1);
   160	  padding: 40px 32px 32px;
   161	  text-align: center;
   162	  max-width: 480px;
   163	  margin: 40px auto;
   164	}
   165	
   166	.emptyIcon {
   167	  color: var(--text-tertiary);
   168	  margin-bottom: 12px;
   169	}
   170	
   171	.emptyCard h2 {
   172	  margin: 0 0 12px;
   173	  font-size: var(--type-18);
   174	  font-weight: var(--weight-bold);
   175	  color: var(--text-primary);
   176	  text-wrap: pretty;
   177	}
   178	
   179	.emptyCard p {
   180	  color: var(--text-secondary);
   181	  font-size: var(--type-14);
   182	  line-height: 1.5;
   183	  margin: 0 0 20px;
   184	  text-wrap: pretty;
   185	}
   186	
   187	.emptyOr {
   188	  margin-top: 16px !important;
   189	  font-size: var(--type-13) !important;
   190	}
   191	
   192	.instructorGroup {
   193	  margin-bottom: 32px;
   194	}
   195	
   196	.instructorTitle {
   197	  font-size: var(--type-16);
   198	  font-weight: var(--weight-bold);
   199	  margin: 0 0 12px;
   200	  color: var(--text-primary);
   201	}
   202	
   203	.seriesGroup {
   204	  margin-bottom: 24px;
   205	}
   206	
   207	.seriesTitle {
   208	  font-size: var(--type-13);
   209	  font-weight: var(--weight-medium);
   210	  color: var(--text-secondary);
   211	  margin: 0 0 12px;
   212	  text-transform: uppercase;
   213	  letter-spacing: .06em;
   214	}
   215	
   216	.grid {
   217	  display: grid;
   218	  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
   219	  gap: 16px 12px;
   220	}
   221	
   222	.card {
   223	  display: flex;
   224	  flex-direction: column;
   225	  align-items: stretch;
   226	  text-align: left;
   227	  background: transparent;
   228	  border: none;
   229	  padding: 0;
   230	  cursor: pointer;
   231	  color: var(--text-primary);
   232	}
   233	
   234	.card:disabled {
   235	  opacity: 0.7;
   236	  cursor: default;
   237	}
   238	
   239	.thumb {
   240	  position: relative;
   241	  aspect-ratio: 16 / 9;
   242	  border-radius: var(--radius-md);
   243	  overflow: hidden;
   244	  background: var(--surface-raised);
   245	  box-shadow: var(--shadow-1);
   246	  display: flex;
   247	  align-items: center;
   248	  justify-content: center;
   249	  transition:
   250	    transform var(--duration-fast) var(--ease-standard),
   251	    filter var(--duration-fast) var(--ease-standard);
   252	}
   253	
   254	.card:hover:not(:disabled) .thumb,
   255	.card:focus-visible .thumb {
   256	  transform: translateY(-2px);
   257	  filter: brightness(1.08);
   258	}
   259	
   260	.thumbGlyph {
   261	  display: inline-flex;
   262	  color: var(--text-tertiary);
   263	}
   264	
   265	.durationBadge {
   266	  position: absolute;
   267	  right: 6px;
   268	  bottom: 6px;
   269	  background: rgb(0 0 0 / 80%);
   270	  color: #fff;
   271	  font-size: var(--type-11);
   272	  font-weight: var(--weight-bold);
   273	  padding: 2px 5px;
   274	  border-radius: var(--radius-xs);
   275	  font-variant-numeric: tabular-nums;
   276	}
   277	
   278	.thumbOverlay {
   279	  position: absolute;
   280	  inset: 0;
   281	  background: rgb(0 0 0 / 55%);
   282	  display: flex;
   283	  align-items: center;
   284	  justify-content: center;
   285	  color: #fff;
   286	  font-size: var(--type-13);
   287	}
   288	
   289	.cardBody {
   290	  display: flex;
   291	  flex-direction: column;
   292	  gap: 3px;
   293	  padding: 10px 2px 0;
   294	}
   295	
   296	.cardTitle {
   297	  font-size: var(--type-14);
   298	  font-weight: var(--weight-medium);
   299	  line-height: 1.35;
   300	  display: -webkit-box;
   301	  -webkit-line-clamp: 2;
   302	  -webkit-box-orient: vertical;
   303	  overflow: hidden;
   304	  color: var(--text-secondary);
   305	  transition: color var(--duration-fast) var(--ease-standard);
   306	}
   307	
   308	.card:hover:not(:disabled) .cardTitle,
   309	.card:focus-visible .cardTitle {
   310	  color: var(--text-primary);
   311	}
   312	
   313	.cardInstructor {
   314	  font-size: var(--type-12);
   315	  color: var(--text-secondary);
   316	}
   317	
   318	.badgeMatched {
   319	  align-self: flex-start;
   320	  font-size: var(--type-11);
   321	  color: var(--accent-green);
   322	  margin-top: 2px;
   323	}
   324	
   325	.badgeMissing {
   326	  align-self: flex-start;
   327	  font-size: var(--type-11);
   328	  color: var(--text-secondary);
   329	  margin-top: 2px;
   330	}

CONCEPTS_DOCK_CSS
     1	.pane {
     2	  display: flex;
     3	  flex-direction: column;
     4	  height: 100%;
     5	  min-height: 0;
     6	}
     7	
     8	.status {
     9	  color: var(--text-secondary);
    10	  font-size: var(--type-13);
    11	  margin: 0;
    12	}
    13	
    14	.toolbar {
    15	  display: flex;
    16	  align-items: center;
    17	  gap: 8px;
    18	  margin-bottom: 8px;
    19	  flex-shrink: 0;
    20	}
    21	
    22	.search {
    23	  flex: 1;
    24	  background: var(--surface-bg);
    25	  border: 1px solid var(--border-default);
    26	  color: var(--text-primary);
    27	  border-radius: var(--radius-sm);
    28	  padding: 6px 10px;
    29	  font-size: var(--type-13);
    30	  transition: border-color var(--duration-fast) var(--ease-standard);
    31	}
    32	
    33	.search:hover {
    34	  border-color: var(--border-strong);
    35	}
    36	
    37	.search:focus-visible {
    38	  outline: none;
    39	  border-color: var(--accent-blue);
    40	  box-shadow: var(--focus-ring);
    41	}
    42	
    43	.search::placeholder {
    44	  color: var(--text-tertiary);
    45	}
    46	
    47	.detachButton {
    48	  background: transparent;
    49	  border: 1px solid var(--border-default);
    50	  color: var(--text-secondary);
    51	  border-radius: var(--radius-pill);
    52	  padding: 6px 10px;
    53	  font-size: var(--type-12);
    54	  cursor: pointer;
    55	  white-space: nowrap;
    56	  transition:
    57	    color var(--duration-fast) var(--ease-standard),
    58	    border-color var(--duration-fast) var(--ease-standard),
    59	    background-color var(--duration-fast) var(--ease-standard);
    60	}
    61	
    62	.detachButton:hover {
    63	  color: var(--danger);
    64	  border-color: var(--danger);
    65	  background: color-mix(in srgb, var(--danger) 12%, transparent);
    66	}
    67	
    68	.progress {
    69	  font-size: var(--type-12);
    70	  color: var(--text-secondary);
    71	  margin-bottom: 8px;
    72	  flex-shrink: 0;
    73	  font-variant-numeric: tabular-nums;
    74	}
    75	
    76	.list {
    77	  flex: 1;
    78	  min-height: 0;
    79	  overflow-y: auto;
    80	}
    81	
    82	.sectionLabel {
    83	  font-size: var(--type-11);
    84	  font-weight: var(--weight-medium);
    85	  text-transform: uppercase;
    86	  letter-spacing: .06em;
    87	  color: var(--text-tertiary);
    88	  margin: 12px 0 6px;
    89	}
    90	
    91	.group {
    92	  list-style: none;
    93	  margin: 0;
    94	  padding: 0;
    95	  display: flex;
    96	  flex-direction: column;
    97	  gap: 4px;
    98	}
    99	
   100	.item {
   101	  display: flex;
   102	  align-items: center;
   103	  gap: 8px;
   104	  padding: 6px 8px;
   105	  border-radius: var(--radius-sm);
   106	  transition: background-color var(--duration-fast) var(--ease-standard);
   107	}
   108	
   109	.item:hover {
   110	  background: var(--hover-overlay);
   111	}
   112	
   113	.itemActive {
   114	  background: color-mix(in srgb, var(--accent-green) 14%, transparent);
   115	}
   116	
   117	.itemActive:hover {
   118	  background: color-mix(in srgb, var(--accent-green) 20%, transparent);
   119	}
   120	
   121	.timeChip {
   122	  background: color-mix(in srgb, var(--accent-blue) 15%, transparent);
   123	  border: none;
   124	  color: var(--accent-blue);
   125	  border-radius: var(--radius-pill);
   126	  padding: 2px 8px;
   127	  font-size: var(--type-11);
   128	  font-variant-numeric: tabular-nums;
   129	  cursor: pointer;
   130	  flex-shrink: 0;
   131	  transition: background-color var(--duration-fast) var(--ease-standard);
   132	}
   133	
   134	.timeChip:hover {
   135	  background: color-mix(in srgb, var(--accent-blue) 28%, transparent);
   136	}
   137	
   138	.itemTitle {
   139	  flex: 1;
   140	  min-width: 0;
   141	  font-size: var(--type-13);
   142	  color: var(--text-primary);
   143	  overflow: hidden;
   144	  text-overflow: ellipsis;
   145	  white-space: nowrap;
   146	}
   147	
   148	.covered {
   149	  display: inline-flex;
   150	  color: var(--accent-green);
   151	  flex-shrink: 0;
   152	}
   153	
   154	.attachPane {
   155	  display: flex;
   156	  flex-direction: column;
   157	  gap: 10px;
   158	  height: 100%;
   159	  min-height: 0;
   160	}
   161	
   162	.docList {
   163	  display: flex;
   164	  flex-direction: column;
   165	  gap: 6px;
   166	  overflow-y: auto;
   167	}
   168	
   169	.docButton {
   170	  text-align: left;
   171	  background: var(--surface-popover);
   172	  border: 1px solid var(--border-hairline);
   173	  color: var(--text-primary);
   174	  border-radius: var(--radius-sm);
   175	  padding: 8px 10px;
   176	  font-size: var(--type-12);
   177	  cursor: pointer;
   178	  overflow: hidden;
   179	  text-overflow: ellipsis;
   180	  white-space: nowrap;
   181	  transition: background-color var(--duration-fast) var(--ease-standard);
   182	}
   183	
   184	.docButton:hover:not(:disabled) {
   185	  background: var(--surface-hover);
   186	}
   187	
   188	.docButton:disabled {
   189	  opacity: 0.5;
   190	  cursor: default;
   191	}
   192	
   193	.customRow {
   194	  display: flex;
   195	  gap: 8px;
   196	}
   197	
   198	.input {
   199	  flex: 1;
   200	  background: var(--surface-bg);
   201	  border: 1px solid var(--border-default);
   202	  color: var(--text-primary);
   203	  border-radius: var(--radius-sm);
   204	  padding: 6px 10px;
   205	  font-size: var(--type-13);
   206	  transition: border-color var(--duration-fast) var(--ease-standard);
   207	}
   208	
   209	.input:hover {
   210	  border-color: var(--border-strong);
   211	}
   212	
   213	.input:focus-visible {
   214	  outline: none;
   215	  border-color: var(--accent-blue);
   216	  box-shadow: var(--focus-ring);
   217	}
   218	
   219	.primaryButton {
   220	  background: var(--accent-blue);
   221	  color: var(--surface-bg);
   222	  border: none;
   223	  border-radius: var(--radius-pill);
   224	  padding: 6px 14px;
   225	  font-size: var(--type-13);
   226	  font-weight: var(--weight-bold);
   227	  cursor: pointer;
   228	  white-space: nowrap;
   229	  transition:
   230	    background-color var(--duration-fast) var(--ease-standard),
   231	    transform var(--duration-press) var(--ease-standard);
   232	}
   233	
   234	.primaryButton:hover:not(:disabled) {
   235	  background: color-mix(in srgb, var(--accent-blue) 85%, white);
   236	}
   237	
   238	.primaryButton:active:not(:disabled) {
   239	  transform: scale(.98);
   240	}
   241	
   242	.primaryButton:disabled {
   243	  opacity: 0.5;
   244	  cursor: default;
   245	}

ANALYSIS_CSS
     1	.section {
     2	  margin-top: 14px;
     3	}
     4	
     5	.section:first-child {
     6	  margin-top: 0;
     7	}
     8	
     9	.sectionHeader {
    10	  font-size: var(--type-11);
    11	  font-weight: var(--weight-medium);
    12	  text-transform: uppercase;
    13	  letter-spacing: .06em;
    14	  color: var(--text-tertiary);
    15	  margin: 0 0 8px;
    16	}
    17	
    18	.list {
    19	  list-style: none;
    20	  margin: 0;
    21	  padding: 0;
    22	  display: flex;
    23	  flex-direction: column;
    24	  gap: 4px;
    25	}
    26	
    27	.pearlRow {
    28	  display: flex;
    29	  flex-direction: column;
    30	  gap: 4px;
    31	  padding: 6px 8px;
    32	  border-radius: var(--radius-sm);
    33	  cursor: pointer;
    34	  transition: background-color var(--duration-fast) var(--ease-standard);
    35	}
    36	
    37	.pearlRow:hover {
    38	  background: var(--hover-overlay);
    39	}
    40	
    41	.pearlHead {
    42	  display: flex;
    43	  align-items: center;
    44	  gap: 8px;
    45	}
    46	
    47	.stars {
    48	  display: inline-flex;
    49	  gap: 1px;
    50	  color: var(--accent-amber);
    51	  flex-shrink: 0;
    52	}
    53	
    54	.timeChip {
    55	  background: color-mix(in srgb, var(--accent-blue) 15%, transparent);
    56	  border: none;
    57	  color: var(--accent-blue);
    58	  border-radius: var(--radius-pill);
    59	  padding: 2px 8px;
    60	  font-size: var(--type-11);
    61	  font-variant-numeric: tabular-nums;
    62	  cursor: pointer;
    63	  flex-shrink: 0;
    64	  transition: background-color var(--duration-fast) var(--ease-standard);
    65	}
    66	
    67	.timeChip:hover {
    68	  background: color-mix(in srgb, var(--accent-blue) 28%, transparent);
    69	}
    70	
    71	.timeChip:active {
    72	  transform: scale(.96);
    73	}
    74	
    75	.pearlLabel {
    76	  flex: 1;
    77	  min-width: 0;
    78	  font-size: var(--type-13);
    79	  color: var(--text-primary);
    80	  overflow: hidden;
    81	  text-overflow: ellipsis;
    82	  white-space: nowrap;
    83	}
    84	
    85	.pearlInsight {
    86	  font-size: var(--type-12);
    87	  color: var(--text-secondary);
    88	  line-height: 1.4;
    89	  padding-left: 8px;
    90	}
    91	
    92	.conceptRow {
    93	  padding: 8px;
    94	  border-radius: var(--radius-sm);
    95	}
    96	
    97	.conceptTitle {
    98	  font-size: var(--type-13);
    99	  font-weight: var(--weight-medium);
   100	  color: var(--text-primary);
   101	  margin: 0 0 4px;
   102	}
   103	
   104	.conceptSummary {
   105	  font-size: var(--type-12);
   106	  color: var(--text-secondary);
   107	  margin: 0 0 6px;
   108	  line-height: 1.4;
   109	}
   110	
   111	.anchorRow {
   112	  display: flex;
   113	  gap: 6px;
   114	  flex-wrap: wrap;
   115	}
   116	
   117	.themeRow {
   118	  padding: 8px;
   119	}
   120	
   121	.themeTitle {
   122	  font-size: var(--type-13);
   123	  font-weight: var(--weight-medium);
   124	  color: var(--text-primary);
   125	  margin: 0 0 4px;
   126	}
   127	
   128	.themeBody {
   129	  font-size: var(--type-12);
   130	  color: var(--text-secondary);
   131	  line-height: 1.4;
   132	  margin: 0;
   133	}
   134	
   135	.handleGroup {
   136	  margin-bottom: 12px;
   137	}
   138	
   139	.handleHeader {
   140	  display: flex;

NOTATION_TSX
    40	  const clearWait = (): void => {
    41	    if (waitTimerRef.current) {
    42	      clearTimeout(waitTimerRef.current);
    43	      waitTimerRef.current = null;
    44	    }
    45	    waitTokenRef.current += 1; // invalidates any in-flight .finally() from a previous wait
    46	    setWaitingForShot(false);
    47	    setOfferSaveWithoutFrame(false);
    48	  };
    49	
    50	  // Reset the draft + autofocus each time the modal transitions closed -> open;
    51	  // remember the invoking control so focus can be restored on close.
    52	  useEffect(() => {
    53	    if (modal && !wasOpenRef.current) {
    54	      setText("");
    55	      invokerRef.current = document.activeElement as HTMLElement | null;
    56	      const raf = requestAnimationFrame(() => textareaRef.current?.focus());
    57	      wasOpenRef.current = true;
    58	      return () => cancelAnimationFrame(raf);
    59	    }
    60	    if (!modal && wasOpenRef.current) {
    61	      wasOpenRef.current = false;
    62	      invokerRef.current?.focus?.();
    63	    }
    64	    return undefined;
    65	  }, [modal]);
    66	
    67	  // A new generation (fresh N press, cancel, or a save that just completed)
    68	  // invalidates any pending wait so it can never bleed into the next attempt.
    69	  useEffect(() => {
    70	    clearWait();
    71	    // eslint-disable-next-line react-hooks/exhaustive-deps
    72	  }, [notationGeneration]);
    73	
    74	  useEffect(() => {
    75	    if (!modal) return undefined;
    76	    function onKeyDown(e: KeyboardEvent): void {
    77	      if (e.key === "Escape") {
    78	        e.preventDefault();
    79	        cancelNotation();
    80	        return;
    81	      }
    82	      // Simple focus trap: keep Tab cycling within the card.
    83	      if (e.key === "Tab" && cardRef.current) {
    84	        const focusable = cardRef.current.querySelectorAll<HTMLElement>(
    85	          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    86	        );
    87	        if (focusable.length === 0) return;
    88	        const first = focusable[0];
    89	        const last = focusable[focusable.length - 1];
    90	        if (e.shiftKey && document.activeElement === first) {
    91	          e.preventDefault();
    92	          last.focus();
    93	        } else if (!e.shiftKey && document.activeElement === last) {
    94	          e.preventDefault();
    95	          first.focus();
    96	        }
    97	      }
    98	    }
    99	    window.addEventListener("keydown", onKeyDown);
   100	    return () => window.removeEventListener("keydown", onKeyDown);
   101	  }, [modal, cancelNotation]);
   102	
   103	  if (!modal || !currentProject) return null;
   104	
   105	  const busy = modal.saving || waitingForShot;
   106	
   107	  const handleSave = (): void => {
   108	    if (modal.shotLoading && modal.shotPromise) {
   109	      const token = waitTokenRef.current;
   110	      setWaitingForShot(true);
   111	      setOfferSaveWithoutFrame(false);
   112	      waitTimerRef.current = setTimeout(() => {
   113	        if (waitTokenRef.current !== token) return;
   114	        setOfferSaveWithoutFrame(true);
   115	      }, SHOT_WAIT_TIMEOUT_MS);
   116	      modal.shotPromise.finally(() => {
   117	        // Superseded (cancelled, timed out into "save without frame", or a
   118	        // new N press) while we were waiting — don't act on stale intent.
   119	        if (waitTokenRef.current !== token) return;
   120	        clearWait();
   121	        void saveNotation(text);
   122	      });
   123	      return;
   124	    }
   125	    void saveNotation(text);
   126	  };
   127	
   128	  const handleSaveWithoutFrame = (): void => {
   129	    clearWait();
   130	    void saveNotation(text);
   131	  };
   132	
   133	  const handleBackdropClick = (): void => {
   134	    if (busy) return;
   135	    cancelNotation();
   136	  };
   137	
   138	  return (
   139	    <div className={styles.overlay} data-state="open" role="presentation" onMouseDown={handleBackdropClick}>
   140	      <form
   141	        className={styles.card}
   142	        ref={cardRef}
   143	        data-state="open"
   144	        role="dialog"
   145	        aria-modal="true"
   146	        aria-label="Add notation"
   147	        onMouseDown={(e) => e.stopPropagation()}
   148	        onSubmit={(e) => {
   149	          e.preventDefault();
   150	          handleSave();
   151	        }}
   152	      >
   153	        <header className={styles.header}>
   154	          <div className={styles.headerText}>
   155	            <h2 className={styles.title}>Add notation</h2>
   156	            <span className={styles.timestamp}>{formatTimestamp(modal.t)}</span>
   157	          </div>
   158	          <button type="button" className={styles.closeButton} onClick={cancelNotation} aria-label="Close">
   159	            <Icon name="close" size={18} />
   160	          </button>
   161	        </header>
   162	
   163	        <div className={styles.content}>
   164	          <div className={styles.thumb}>
   165	            {modal.shotLoading && <div className={styles.spinner} aria-label="Capturing frame…" />}
   166	            {!modal.shotLoading && modal.shot && (
   167	              <img className={styles.thumbImg} src={api.shotUrl(currentProject.id, modal.shot)} alt="" />
   168	            )}
   169	            {!modal.shotLoading && !modal.shot && <div className={styles.noFrame}>No frame</div>}
   170	          </div>
   171	          <div className={styles.fields}>
   172	            {modal.conceptTitle && (
   173	              <div className={styles.conceptChip}>
   174	                <span className={styles.conceptChipText}>re: {modal.conceptTitle}</span>
   175	                <button
   176	                  type="button"
   177	                  className={styles.quoteRemove}
   178	                  onClick={removeNotationConcept}
   179	                  aria-label="Remove concept reference"
   180	                  title="Remove concept reference"
   181	                >
   182	                  <Icon name="close" size={12} />
   183	                </button>
   184	              </div>
   185	            )}
   186	
   187	            {modal.quote && (
   188	              <div className={styles.quote}>
   189	                <span className={styles.quoteText}>&ldquo;{modal.quote}&rdquo;</span>
   190	                <button
   191	                  type="button"
   192	                  className={styles.quoteRemove}
   193	                  onClick={removeNotationQuote}
   194	                  aria-label="Remove quoted transcript"
   195	                  title="Remove quote"
   196	                >
   197	                  <Icon name="close" size={12} />
   198	                </button>
   199	              </div>
   200	            )}
   201	
   202	            <textarea
   203	              ref={textareaRef}
   204	              className={styles.textarea}
   205	              placeholder="Add a note…"
   206	              value={text}
   207	              onChange={(e) => setText(e.target.value)}
   208	              disabled={waitingForShot}
   209	            />
   210	          </div>
   211	        </div>
   212	
   213	        <footer className={styles.actions}>
   214	          <button type="button" className={styles.secondaryButton} onClick={cancelNotation}>
   215	            Cancel (Esc)
   216	          </button>
   217	          {offerSaveWithoutFrame && (
   218	            <button type="button" className={styles.secondaryButton} onClick={handleSaveWithoutFrame}>
   219	              Save without frame
   220	            </button>
   221	          )}
   222	          <button
   223	            type="submit"
   224	            className={styles.primaryButton}
   225	            disabled={busy}
   226	            aria-busy={busy}
   227	          >
   228	            {busy && <span className={styles.buttonSpinner} aria-hidden="true" />}
   229	            {modal.saving ? "Saving…" : waitingForShot ? "Capturing…" : "Save"}
   230	          </button>
   231	        </footer>
   232	      </form>
   233	    </div>
   234	  );
   235	}

COMPILE_CSS_HEAD
     1	.compileButton {
     2	  display: inline-flex;
     3	  align-items: center;
     4	  gap: 6px;
     5	  background: var(--surface-popover);
     6	  border: none;
     7	  color: var(--text-primary);
     8	  border-radius: var(--radius-pill);
     9	  padding: 8px 16px;
    10	  font-size: var(--type-13);
    11	  font-weight: var(--weight-medium);
    12	  cursor: pointer;
    13	  white-space: nowrap;
    14	  flex-shrink: 0;
    15	  transition:
    16	    background-color var(--duration-fast) var(--ease-standard),
    17	    transform var(--duration-press) var(--ease-standard);
    18	}
    19	
    20	.compileButton:hover:not(:disabled) {
    21	  background: var(--surface-hover);
    22	}
    23	
    24	.compileButton:active:not(:disabled) {
    25	  transform: scale(.98);
    26	}
    27	
    28	.compileButton:disabled {
    29	  opacity: 0.6;
    30	  cursor: default;
    31	}
    32	
    33	.overlay {
    34	  position: fixed;
    35	  inset: 0;
    36	  background: var(--surface-scrim);
    37	  display: flex;
    38	  align-items: center;
    39	  justify-content: center;
    40	  z-index: 300;
    41	  padding: 24px;
    42	  animation: backdrop-in var(--duration-standard) var(--ease-enter) both;
    43	}
    44	
    45	@keyframes backdrop-in {
    46	  from { opacity: 0; }
    47	  to { opacity: 1; }
    48	}
    49	
    50	@keyframes modal-in {
    51	  from { opacity: 0; transform: translateY(12px) scale(.98); }
    52	  to { opacity: 1; transform: none; }
    53	}
    54	
    55	.card {
    56	  background: var(--surface-overlay);
    57	  border: 1px solid var(--border-hairline);
    58	  border-radius: var(--radius-lg);
    59	  box-shadow: var(--shadow-3);
    60	  width: min(560px, 100%);
    61	  max-height: min(80vh, 640px);
    62	  display: flex;
    63	  flex-direction: column;
    64	  padding: 20px;
    65	  gap: 12px;
    66	  overflow: hidden;
    67	  animation: modal-in var(--duration-modal) var(--ease-enter) both;
    68	}
    69	
    70	.previewCard {
    71	  background: var(--surface-overlay);
    72	  border: 1px solid var(--border-hairline);
    73	  border-radius: var(--radius-lg);
    74	  box-shadow: var(--shadow-3);
    75	  width: min(680px, 100%);
    76	  max-height: min(85vh, 720px);
    77	  display: flex;
    78	  flex-direction: column;
    79	  padding: 20px;
    80	  gap: 10px;
    81	  overflow: hidden;
    82	  animation: modal-in var(--duration-modal) var(--ease-enter) both;
    83	}
    84	
    85	.header,
    86	.previewHeader {
    87	  display: flex;
    88	  align-items: center;
    89	  justify-content: space-between;
    90	  gap: 12px;
    91	}
    92	
    93	.closeButton {
    94	  flex-shrink: 0;
    95	  width: 32px;
    96	  height: 32px;
    97	  display: flex;
    98	  align-items: center;
    99	  justify-content: center;
   100	  background: transparent;
   101	  border: none;
   102	  border-radius: 50%;
   103	  color: var(--text-secondary);
   104	  cursor: pointer;
   105	  transition:
   106	    background-color var(--duration-fast) var(--ease-standard),
   107	    color var(--duration-fast) var(--ease-standard),
   108	    transform var(--duration-press) var(--ease-standard);
   109	}
   110	

DIFF_HARDCODED
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-fC9geUdg' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-cybESWbO' (errno=Operation not permitted)
303:+  animation: spin 700ms linear infinite;
385:+  box-shadow: 0 0 0 1px rgb(0 0 0 / 30%);
960:+  animation: spin 700ms linear infinite;

2026-07-28T23:35:54.444263Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 87 column 5
exec
/bin/zsh -lc "printf 'SKELETON_USAGE\\n'; rg -n \"skeleton|Skeleton\" web/src --glob '*.{ts,tsx,css}' ; printf '\\nICON_BUTTON_TOOLTIPS\\n'; rg -n \"<button|title=|aria-label=\" web/src/player/PlayerControls.tsx | sed -n '1,260p'; printf '\\nRAIL_TSX\\n'; nl -ba web/src/study/RightRail.tsx | sed -n '90,270p'; printf '\\nCONCEPT_DOCK_TSX_RELEVANT\\n'; nl -ba web/src/concepts/ConceptsDock.tsx | sed -n '80,220p'; printf '\\nCURRENT_GIT_STATUS\\n'; git status --short" in /Users/antemo/studyloop
 succeeded in 0ms:
SKELETON_USAGE
web/src/index.css:246:/* Reusable skeleton shimmer */
web/src/index.css:247:.skeleton {
web/src/index.css:256:  animation: skeleton-shimmer 1.4s linear infinite;
web/src/index.css:259:@keyframes skeleton-shimmer {
web/src/index.css:284:  .skeleton {

ICON_BUTTON_TOOLTIPS
92:      <button
97:        aria-label={isPlaying ? "Pause" : "Play"}
111:        <button
116:          aria-label={muted ? "Unmute" : "Mute"}
130:          aria-label="Volume"
141:        <button type="button" className={styles.loopBadge} onClick={clearLoop} title="Clear A/B loop">
150:      <button
155:        aria-label="Add notation"
156:        title="Add notation (N)"
160:      <button
165:        aria-label="Screenshot"
166:        title={ffmpegMissing ? "ffmpeg not found on PATH — screenshots are disabled" : "Screenshot (S)"}
170:      <button
175:        aria-label={analyzing ? `Analyzing, ${analyzeStatus.pct}% complete` : analysis ? "Re-analyze" : "Analyze"}
177:        title={analyzing ? `Analyzing… ${analyzeStatus.pct}%` : analysis ? "Re-analyze" : "Analyze"}
181:      <button
185:        aria-label="Toggle captions"
186:        title="Toggle captions (C)"
193:        <button
199:          aria-label="Playback settings"
200:          title="Settings"
209:                <button
224:              <button
232:              <button
241:                <button type="button" className={styles.menuButton} onClick={clearLoop}>
250:      <button
254:        aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
255:        title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}

RAIL_TSX
    90	  const [openingVideoId, setOpeningVideoId] = useState<string | null>(null);
    91	
    92	  // SPEC: "Local videos: section hidden entirely (no dead space)" — this is
    93	  // stricter than the V2-A placeholder, which rendered an explanation card
    94	  // for local sources too. A youtube source with no related yet (fresh
    95	  // resolve, or Innertube came back empty) still renders the card shell so
    96	  // the refresh button and empty state are reachable.
    97	  if (!currentProject || currentProject.source.type !== "youtube") return null;
    98	
    99	  const related = currentProject.related ?? [];
   100	
   101	  const handleOpen = async (video: RelatedVideo): Promise<void> => {
   102	    setOpeningVideoId(video.videoId);
   103	    try {
   104	      const project = await openOrCreateYoutubeProject(video.videoId);
   105	      navigate({ view: "study", projectId: project.id });
   106	    } catch {
   107	      // store already toasted the error
   108	    } finally {
   109	      setOpeningVideoId(null);
   110	    }
   111	  };
   112	
   113	  const handleRefresh = async (): Promise<void> => {
   114	    if (refreshing) return;
   115	    setRefreshing(true);
   116	    try {
   117	      await refreshRelated();
   118	    } finally {
   119	      setRefreshing(false);
   120	    }
   121	  };
   122	
   123	  return (
   124	    <section className={styles.card}>
   125	      <div className={styles.cardHeaderRow}>
   126	        <div className={styles.cardHeaderStatic}>
   127	          <span className={styles.cardTitle}>Up next</span>
   128	        </div>
   129	        <button
   130	          type="button"
   131	          className={`${styles.tickerMuteButton} ${refreshing ? styles.spinning : ""}`}
   132	          onClick={() => void handleRefresh()}
   133	          disabled={refreshing}
   134	          title="Refresh related videos"
   135	          aria-label="Refresh related videos"
   136	        >
   137	          <Icon name="refresh" size={16} />
   138	        </button>
   139	      </div>
   140	      {related.length === 0 ? (
   141	        <div className={styles.upNextEmpty}>
   142	          No related videos yet — try the refresh button, or Innertube may be unreachable right now.
   143	        </div>
   144	      ) : (
   145	        <div className={styles.upNextList}>
   146	          {related.map((video) => (
   147	            <UpNextCard
   148	              key={video.videoId}
   149	              video={video}
   150	              opening={openingVideoId === video.videoId}
   151	              onOpen={() => void handleOpen(video)}
   152	            />
   153	          ))}
   154	        </div>
   155	      )}
   156	    </section>
   157	  );
   158	}
   159	
   160	export function RightRail({ segments, transcriptLoading }: Props): JSX.Element {
   161	  const conceptTickerMuted = useStudyLoopStore((s) => s.conceptTickerMuted);
   162	  const setConceptTickerMuted = useStudyLoopStore((s) => s.setConceptTickerMuted);
   163	
   164	  return (
   165	    <div className={styles.rail}>
   166	      <RailCard title="Transcript" defaultExpanded>
   167	        <div className={styles.transcriptViewport}>
   168	          <TranscriptPane segments={segments} loading={transcriptLoading} />
   169	        </div>
   170	      </RailCard>
   171	
   172	      <RailCard
   173	        id="concepts-rail"
   174	        title="Concepts"
   175	        defaultExpanded
   176	        headerAction={
   177	          <button
   178	            type="button"
   179	            className={styles.tickerMuteButton}
   180	            onClick={(e) => {
   181	              e.stopPropagation();
   182	              setConceptTickerMuted(!conceptTickerMuted);
   183	            }}
   184	            title={conceptTickerMuted ? "Unmute concept pop-ups" : "Mute concept pop-ups"}
   185	            aria-label={conceptTickerMuted ? "Unmute concept pop-ups" : "Mute concept pop-ups"}
   186	            aria-pressed={conceptTickerMuted}
   187	          >
   188	            <Icon name={conceptTickerMuted ? "notificationsOff" : "notifications"} size={16} />
   189	          </button>
   190	        }
   191	      >
   192	        <div className={styles.conceptsViewport}>
   193	          <PearlsSection />
   194	          <ConceptsDock />
   195	          <AiBreakdownSection />
   196	          <ThemesSection />
   197	        </div>
   198	      </RailCard>
   199	
   200	      <OthersAnalysisCard />
   201	
   202	      <UpNextCabinet />
   203	    </div>
   204	  );
   205	}
   206	
   207	/** Only renders a card shell at all once there's an overlay to show — otherwise an empty "Others' analysis" header with nothing under it. */
   208	function OthersAnalysisCard(): JSX.Element | null {
   209	  const overlays = useStudyLoopStore((s) => s.overlays);
   210	  const overlaysVisible = useStudyLoopStore((s) => s.overlaysVisible);
   211	  if (!overlaysVisible || overlays.length === 0) return null;
   212	  return (
   213	    <RailCard title="Others' analysis" defaultExpanded>
   214	      <OthersAnalysisSection />
   215	    </RailCard>
   216	  );
   217	}

CONCEPT_DOCK_TSX_RELEVANT
    80	    try {
    81	      await attachConceptDoc(trimmed);
    82	      pushToast("Concept doc attached", "success");
    83	    } finally {
    84	      setAttaching(false);
    85	    }
    86	  };
    87	
    88	  if (!currentProject) return <p className={styles.status}>Loading…</p>;
    89	
    90	  if (!attached) {
    91	    const docs = config?.conceptDocs ?? [];
    92	    return (
    93	      <div className={styles.attachPane}>
    94	        <p className={styles.status}>No concept doc attached to this project.</p>
    95	        {docs.length > 0 && (
    96	          <div className={styles.docList}>
    97	            {docs.map((path) => (
    98	              <button
    99	                key={path}
   100	                type="button"
   101	                className={styles.docButton}
   102	                disabled={attaching}
   103	                onClick={() => void handleAttach(path)}
   104	                title={path}
   105	              >
   106	                {path}
   107	              </button>
   108	            ))}
   109	          </div>
   110	        )}
   111	        <div className={styles.customRow}>
   112	          <input
   113	            type="text"
   114	            className={styles.input}
   115	            placeholder="/path/to/concept-doc.md"
   116	            value={customPath}
   117	            onChange={(e) => setCustomPath(e.target.value)}
   118	            onKeyDown={(e) => {
   119	              if (e.key === "Enter") void handleAttach(customPath);
   120	            }}
   121	          />
   122	          <button
   123	            type="button"
   124	            className={styles.primaryButton}
   125	            disabled={attaching || !customPath.trim()}
   126	            onClick={() => void handleAttach(customPath)}
   127	          >
   128	            {attaching ? "Attaching…" : "Attach"}
   129	          </button>
   130	        </div>
   131	      </div>
   132	    );
   133	  }
   134	
   135	  return (
   136	    <div className={styles.pane}>
   137	      <div className={styles.toolbar}>
   138	        <input
   139	          type="text"
   140	          className={styles.search}
   141	          placeholder="Search concepts…"
   142	          value={query}
   143	          onChange={(e) => setQuery(e.target.value)}
   144	        />
   145	        <button type="button" className={styles.detachButton} onClick={() => void detachConceptDoc()}>
   146	          Detach
   147	        </button>
   148	      </div>
   149	      {concepts.length > 0 && (
   150	        <div className={styles.progress}>
   151	          Covered {coveredIds.size} / {concepts.length}
   152	        </div>
   153	      )}
   154	      {conceptsLoading && <p className={styles.status}>Loading concepts…</p>}
   155	      {!conceptsLoading && concepts.length === 0 && <p className={styles.status}>No concepts found in this doc.</p>}
   156	      {!conceptsLoading && concepts.length > 0 && (
   157	        <div className={styles.list}>
   158	          {visibleAnchored.length > 0 && (
   159	            <ul className={styles.group}>
   160	              {visibleAnchored.map((row, i) => (
   161	                <li
   162	                  key={`${row.card.id}-${i}`}
   163	                  className={`${styles.item} ${activeIds.has(row.card.id) ? styles.itemActive : ""}`}
   164	                >
   165	                  <button type="button" className={styles.timeChip} onClick={() => controller?.seek(row.t)}>
   166	                    {formatTimestamp(row.t)}
   167	                  </button>
   168	                  <span className={styles.itemTitle}>{row.card.title}</span>
   169	                  {coveredIds.has(row.card.id) && (
   170	                    <span className={styles.covered} title="Covered" aria-label="Covered">
   171	                      <Icon name="check" size={14} />
   172	                    </span>
   173	                  )}
   174	                </li>
   175	              ))}
   176	            </ul>
   177	          )}
   178	          {visibleUnanchored.length > 0 && (
   179	            <>
   180	              <div className={styles.sectionLabel}>Unanchored</div>
   181	              <ul className={styles.group}>
   182	                {visibleUnanchored.map((card) => (
   183	                  <li key={card.id} className={`${styles.item} ${activeIds.has(card.id) ? styles.itemActive : ""}`}>
   184	                    <span className={styles.itemTitle}>{card.title}</span>
   185	                    {coveredIds.has(card.id) && (
   186	                      <span className={styles.covered} title="Covered" aria-label="Covered">
   187	                        <Icon name="check" size={14} />
   188	                      </span>
   189	                    )}
   190	                  </li>
   191	                ))}
   192	              </ul>
   193	            </>
   194	          )}
   195	          {noMatches && <p className={styles.status}>No concepts match &ldquo;{query}&rdquo;.</p>}
   196	        </div>
   197	      )}
   198	    </div>
   199	  );
   200	}

CURRENT_GIT_STATUS
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-g7Ru6VDq' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-amjllv6W' (errno=Operation not permitted)

2026-07-28T23:36:00.690461Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 87 column 5
exec
/bin/zsh -lc "printf 'SEEK FULL\\n'; nl -ba web/src/player/SeekBar.tsx | sed -n '130,245p'; printf '\\nTICKER\\n'; nl -ba web/src/concepts/ConceptCard.tsx | sed -n '1,110p'; nl -ba web/src/concepts/ConceptTicker.tsx | sed -n '80,150p'; printf '\\nRAIL HEADER\\n'; nl -ba web/src/study/RightRail.tsx | sed -n '1,90p'; printf '\\nICON CSS CONTROLS\\n'; nl -ba web/src/player/PlayerControls.module.css | sed -n '1,270p'" in /Users/antemo/studyloop
 succeeded in 0ms:
SEEK FULL
   130	      }
   131	    },
   132	    [onSeek, currentTime, duration]
   133	  );
   134	
   135	  const pct = (t: number): string => `${duration > 0 ? Math.min(100, Math.max(0, (t / duration) * 100)) : 0}%`;
   136	
   137	  return (
   138	    <div className={styles.wrapper}>
   139	      <div
   140	        ref={trackRef}
   141	        className={styles.track}
   142	        data-dragging={dragging}
   143	        onMouseMove={handleMouseMove}
   144	        onMouseLeave={() => setHover(null)}
   145	        onMouseDown={handleMouseDown}
   146	        onClick={handleClick}
   147	        onKeyDown={handleKeyDown}
   148	        tabIndex={0}
   149	        role="slider"
   150	        aria-label="Seek"
   151	        aria-valuemin={0}
   152	        aria-valuemax={Math.max(0, Math.round(duration))}
   153	        aria-valuenow={Math.round(currentTime)}
   154	        aria-valuetext={formatTimestamp(currentTime)}
   155	      >
   156	        {heatmap && <HeatmapStrip buckets={heatmap} />}
   157	        {loopA != null && loopB != null && (
   158	          <div
   159	            className={styles.loopRange}
   160	            style={{ left: pct(loopA), width: `calc(${pct(loopB)} - ${pct(loopA)})` }}
   161	          />
   162	        )}
   163	        <div className={styles.fill} style={{ width: pct(currentTime) }} />
   164	        {conceptTicks.map((tick) => (
   165	          <button
   166	            key={tick.id}
   167	            type="button"
   168	            className={styles.conceptTick}
   169	            data-kind="concept"
   170	            style={{ left: pct(tick.t) }}
   171	            aria-label={`Concept: ${tick.title ?? "untitled"} at ${formatTimestamp(tick.t)}`}
   172	            title={tick.title ? `${tick.title} — ${formatTimestamp(tick.t)}` : formatTimestamp(tick.t)}
   173	            onClick={(e) => {
   174	              e.stopPropagation();
   175	              onSeek(tick.t);
   176	            }}
   177	          />
   178	        ))}
   179	        {bubbles.map((bubble) => (
   180	          <button
   181	            key={bubble.id}
   182	            type="button"
   183	            className={styles.bubblePin}
   184	            data-kind="bubble"
   185	            style={{ left: pct(bubble.t) }}
   186	            aria-label={`Note: ${bubble.text || "untitled"} at ${formatTimestamp(bubble.t)}`}
   187	            onMouseEnter={() => setHoverBubble(bubble)}
   188	            onMouseLeave={() => setHoverBubble((cur) => (cur?.id === bubble.id ? null : cur))}
   189	            onFocus={() => setHoverBubble(bubble)}
   190	            onBlur={() => setHoverBubble((cur) => (cur?.id === bubble.id ? null : cur))}
   191	            onClick={(e) => {
   192	              e.stopPropagation();
   193	              (onSeekBubble ?? onSeek)(bubble.t);
   194	            }}
   195	          />
   196	        ))}
   197	        {/* V2-C: pearl diamonds — visually distinct from bubble pins (dots above)
   198	            and concept ticks (bars below); size scales with importance. */}
   199	        {pearls.map((pearl) => (
   200	          <button
   201	            key={pearl.id}
   202	            type="button"
   203	            className={styles.pearlMarker}
   204	            data-kind="pearl"
   205	            style={{ left: pct(pearl.t) }}
   206	            data-importance={pearl.importance}
   207	            aria-label={`Pearl: ${pearl.label} at ${formatTimestamp(pearl.t)}`}
   208	            onMouseEnter={() => setHoverPearl(pearl)}
   209	            onMouseLeave={() => setHoverPearl((cur) => (cur?.id === pearl.id ? null : cur))}
   210	            onFocus={() => setHoverPearl(pearl)}
   211	            onBlur={() => setHoverPearl((cur) => (cur?.id === pearl.id ? null : cur))}
   212	            onClick={(e) => {
   213	              e.stopPropagation();
   214	              (onSeekPearl ?? onSeek)(pearl.t);
   215	            }}
   216	          />
   217	        ))}
   218	        {/* V2-C: imported overlay markers — one colored dot per author handle. */}
   219	        {overlayMarkers.map((marker) => (
   220	          <button
   221	            key={marker.id}
   222	            type="button"
   223	            className={marker.kind === "pearl" ? styles.overlayPearlMarker : styles.overlayBubbleMarker}
   224	            data-kind={`overlay-${marker.kind}`}
   225	            style={{ left: pct(marker.t), background: `hsl(${marker.hue}, 70%, 55%)` }}
   226	            aria-label={`${marker.handle} — ${formatTimestamp(marker.t)}`}
   227	            title={`${marker.handle} — ${formatTimestamp(marker.t)}`}
   228	            onClick={(e) => {
   229	              e.stopPropagation();
   230	              onSeek(Math.max(0, marker.t - 5));
   231	            }}
   232	          />
   233	        ))}
   234	        {loopA != null && (
   235	          <div className={styles.loopMarker} style={{ left: pct(loopA) }} title={`A: ${formatTimestamp(loopA)}`} />
   236	        )}
   237	        {loopB != null && (
   238	          <div className={styles.loopMarker} style={{ left: pct(loopB) }} title={`B: ${formatTimestamp(loopB)}`} />
   239	        )}
   240	        <div className={styles.playhead} style={{ left: pct(currentTime) }} />
   241	        {hoverPearl && (
   242	          <div className={styles.bubbleTooltip} style={{ left: `clamp(28px, ${pct(hoverPearl.t)}, calc(100% - 28px))` }}>
   243	            <span className={styles.pearlStars}>
   244	              {Array.from({ length: 3 }, (_, i) => (
   245	                <Icon key={i} name={i < hoverPearl.importance ? "star" : "starOutline"} size={12} />

TICKER
     1	// F7 concept ticker: the compact card that slides in over the video's bottom-left
     2	// when a concept becomes active. Auto-dismisses itself after 12s (per SPEC);
     3	// clicking the body (not the close button) expands the full card in a side overlay.
     4	import { useEffect } from "react";
     5	import { firstBodyLine } from "../lib/conceptFormat";
     6	import { Icon } from "../components/icons";
     7	import type { ConceptCard as ConceptCardType } from "../lib/types";
     8	import styles from "./ConceptCard.module.css";
     9	
    10	const AUTO_DISMISS_MS = 12_000;
    11	
    12	interface Props {
    13	  card: ConceptCardType;
    14	  onDismiss: () => void;
    15	  onExpand: () => void;
    16	}
    17	
    18	export function ConceptCard({ card, onDismiss, onExpand }: Props): JSX.Element {
    19	  useEffect(() => {
    20	    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    21	    return () => clearTimeout(timer);
    22	    // Intentionally a one-shot timer for the lifetime of this card instance
    23	    // (a fresh ConceptCard is mounted per ticker entry — see ConceptTicker's
    24	    // `key={entry.key}`), not something that should reset on every re-render.
    25	    // eslint-disable-next-line react-hooks/exhaustive-deps
    26	  }, []);
    27	
    28	  const preview = firstBodyLine(card.body);
    29	
    30	  return (
    31	    <div className={styles.card}>
    32	      <button type="button" className={styles.dismiss} onClick={onDismiss} aria-label={`Dismiss ${card.title}`} title="Dismiss">
    33	        <Icon name="close" size={20} />
    34	      </button>
    35	      <button type="button" className={styles.body} onClick={onExpand}>
    36	        <span className={styles.metaRow}>
    37	          <span className={styles.dot} aria-hidden="true" />
    38	          <span className={styles.metaLabel}>Concept</span>
    39	        </span>
    40	        <span className={styles.title}>{card.title}</span>
    41	        {preview && <span className={styles.preview}>{preview}</span>}
    42	      </button>
    43	    </div>
    44	  );
    45	}
    80	        .map((a) => ({ key: tickerKey(a.card.id, a.anchorT), card: a.card }));
    81	      if (additions.length > 0) setEntries((cur) => [...cur, ...additions]);
    82	    }
    83	
    84	    prevKeysRef.current = activeKeys;
    85	    // `active`/`signature` are derived from the same [concepts, currentTime]
    86	    // pair; depending on the stable string avoids re-running this effect
    87	    // every ~250ms sync tick when the active set hasn't actually changed.
    88	    // eslint-disable-next-line react-hooks/exhaustive-deps
    89	  }, [signature, muted]);
    90	
    91	  const dismiss = (key: string): void => {
    92	    dismissedRef.current.add(key);
    93	    setEntries((cur) => cur.filter((e) => e.key !== key));
    94	  };
    95	
    96	  const visible = entries.slice(0, MAX_VISIBLE);
    97	  const overflowCount = entries.length - visible.length;
    98	
    99	  return (
   100	    <>
   101	      {!muted && entries.length > 0 && (
   102	        <div className={styles.stack} data-chrome-visible={chromeVisible}>
   103	          {visible.map((entry) => (
   104	            <ConceptCard
   105	              key={entry.key}
   106	              card={entry.card}
   107	              onDismiss={() => dismiss(entry.key)}
   108	              onExpand={() => setExpanded(entry.card)}
   109	            />
   110	          ))}
   111	          {overflowCount > 0 && (
   112	            <button type="button" className={styles.moreChip} onClick={scrollToConceptsRail}>
   113	              +{overflowCount} more
   114	            </button>
   115	          )}
   116	        </div>
   117	      )}
   118	      {expanded && <ConceptOverlay card={expanded} onClose={() => setExpanded(null)} />}
   119	    </>
   120	  );
   121	}

RAIL HEADER
     1	// SPEC V2 layout: right rail (~402px) — Transcript panel (collapsible header
     2	// card, per YouTube's own "Show transcript" affordance), Concepts (existing
     3	// ConceptsDock content restyled as rail cards), and the Up-next cabinet
     4	// (V2-B: real `project.related` data, see SPEC "Fast YouTube layer").
     5	import { useState, type ReactNode } from "react";
     6	import { useStudyLoopStore } from "../state/store";
     7	import { TranscriptPane } from "../transcript/TranscriptPane";
     8	import { ConceptsDock } from "../concepts/ConceptsDock";
     9	import { PearlsSection, AiBreakdownSection, ThemesSection, OthersAnalysisSection } from "../concepts/AnalysisSections";
    10	import { formatTimestamp } from "../lib/time";
    11	import { Icon } from "../components/icons";
    12	import type { RelatedVideo, TranscriptSegment } from "../lib/types";
    13	import styles from "./RightRail.module.css";
    14	
    15	interface Props {
    16	  segments: TranscriptSegment[];
    17	  transcriptLoading: boolean;
    18	}
    19	
    20	function RailCard({
    21	  id,
    22	  title,
    23	  defaultExpanded,
    24	  headerAction,
    25	  children,
    26	}: {
    27	  id?: string;
    28	  title: string;
    29	  defaultExpanded: boolean;
    30	  headerAction?: ReactNode;
    31	  children: ReactNode;
    32	}): JSX.Element {
    33	  const [expanded, setExpanded] = useState(defaultExpanded);
    34	  return (
    35	    <section id={id} className={styles.card}>
    36	      <div className={styles.cardHeaderRow}>
    37	        <button
    38	          type="button"
    39	          className={styles.cardHeader}
    40	          onClick={() => setExpanded((v) => !v)}
    41	          aria-expanded={expanded}
    42	        >
    43	          <span className={styles.cardTitle}>{title}</span>
    44	          <span className={styles.chevron} data-open={expanded}>
    45	            <Icon name="chevronDown" size={16} />
    46	          </span>
    47	        </button>
    48	        {headerAction}
    49	      </div>
    50	      <div className={styles.expandRegion} data-open={expanded}>
    51	        <div className={styles.expandInner}>
    52	          <div className={styles.cardBody}>{children}</div>
    53	        </div>
    54	      </div>
    55	    </section>
    56	  );
    57	}
    58	
    59	function UpNextCard({ video, onOpen, opening }: { video: RelatedVideo; onOpen: () => void; opening: boolean }): JSX.Element {
    60	  return (
    61	    <button type="button" className={styles.upNextCard} onClick={onOpen} disabled={opening}>
    62	      <span className={styles.upNextThumb}>
    63	        {video.thumbnailUrl ? (
    64	          <img src={video.thumbnailUrl} alt="" className={styles.upNextThumbImg} loading="lazy" />
    65	        ) : (
    66	          <span className={styles.upNextThumbGlyph} aria-hidden="true">
    67	            <Icon name="play" size={22} />
    68	          </span>
    69	        )}
    70	        {video.durationSeconds != null && (
    71	          <span className={styles.upNextDuration}>{formatTimestamp(video.durationSeconds)}</span>
    72	        )}
    73	        {opening && <span className={styles.upNextOverlay}>Opening…</span>}
    74	      </span>
    75	      <span className={styles.upNextBody}>
    76	        <span className={styles.upNextTitle}>{video.title}</span>
    77	        <span className={styles.upNextAuthor}>{video.author}</span>
    78	        {video.viewCountText && <span className={styles.upNextViews}>{video.viewCountText}</span>}
    79	      </span>
    80	    </button>
    81	  );
    82	}
    83	
    84	function UpNextCabinet(): JSX.Element | null {
    85	  const currentProject = useStudyLoopStore((s) => s.currentProject);
    86	  const openOrCreateYoutubeProject = useStudyLoopStore((s) => s.openOrCreateYoutubeProject);
    87	  const refreshRelated = useStudyLoopStore((s) => s.refreshRelated);
    88	  const navigate = useStudyLoopStore((s) => s.navigate);
    89	  const [refreshing, setRefreshing] = useState(false);
    90	  const [openingVideoId, setOpeningVideoId] = useState<string | null>(null);

ICON CSS CONTROLS
     1	.controls {
     2	  display: flex;
     3	  align-items: center;
     4	  gap: 2px;
     5	  padding: 4px 8px 8px;
     6	  color: #fff;
     7	  font-size: var(--type-13);
     8	}
     9	
    10	.iconButton {
    11	  width: 40px;
    12	  height: 40px;
    13	  border-radius: 50%;
    14	  border: none;
    15	  background: transparent;
    16	  color: #fff;
    17	  cursor: pointer;
    18	  display: flex;
    19	  align-items: center;
    20	  justify-content: center;
    21	  flex-shrink: 0;
    22	  text-shadow: 0 1px 2px rgb(0 0 0 / 60%);
    23	  transition:
    24	    background-color var(--duration-fast) var(--ease-standard),
    25	    color var(--duration-fast) var(--ease-standard),
    26	    transform var(--duration-press) var(--ease-standard);
    27	}
    28	
    29	.iconButton:hover:not(:disabled) {
    30	  background: var(--hover-overlay, rgb(255 255 255 / 12%));
    31	}
    32	
    33	.iconButton:active:not(:disabled) {
    34	  transform: scale(.94);
    35	  background: var(--pressed-overlay, rgb(255 255 255 / 20%));
    36	}
    37	
    38	.iconButton:disabled {
    39	  opacity: 0.4;
    40	  cursor: default;
    41	}
    42	
    43	.iconButtonActive {
    44	  color: var(--accent-blue);
    45	}
    46	
    47	.iconButtonBusy {
    48	  color: var(--accent-blue);
    49	  animation: analyzing-pulse 1.4s var(--ease-standard) infinite;
    50	}
    51	
    52	@keyframes analyzing-pulse {
    53	  0%, 100% { opacity: 1; }
    54	  50% { opacity: .55; }
    55	}
    56	
    57	.volumeCluster {
    58	  display: flex;
    59	  align-items: center;
    60	}
    61	
    62	.volumeSlider {
    63	  width: 0;
    64	  opacity: 0;
    65	  accent-color: #fff;
    66	  cursor: pointer;
    67	  transition:
    68	    width var(--duration-standard) var(--ease-standard),
    69	    opacity var(--duration-standard) var(--ease-standard),
    70	    margin-left var(--duration-standard) var(--ease-standard);
    71	}
    72	
    73	.volumeSlider[data-active="true"] {
    74	  width: 72px;
    75	  opacity: 1;
    76	  margin-left: 2px;
    77	}
    78	
    79	.time {
    80	  font-variant-numeric: tabular-nums;
    81	  color: #fff;
    82	  font-size: var(--type-13);
    83	  margin-left: 8px;
    84	  white-space: nowrap;
    85	  text-shadow: 0 1px 2px rgb(0 0 0 / 60%);
    86	}
    87	
    88	.spacer {
    89	  flex: 1;
    90	}
    91	
    92	.loopBadge {
    93	  display: inline-flex;
    94	  align-items: center;
    95	  gap: 6px;
    96	  border: 1px solid var(--border-strong);
    97	  background: var(--hover-overlay, rgb(255 255 255 / 10%));
    98	  color: #fff;
    99	  border-radius: var(--radius-pill);
   100	  padding: 4px 8px 4px 12px;
   101	  font-size: var(--type-12);
   102	  cursor: pointer;
   103	  white-space: nowrap;
   104	  transition:
   105	    background-color var(--duration-fast) var(--ease-standard),
   106	    transform var(--duration-press) var(--ease-standard);
   107	}
   108	
   109	.loopBadge:hover {
   110	  background: var(--active-overlay, rgb(255 255 255 / 16%));
   111	}
   112	
   113	.loopBadge:active {
   114	  transform: scale(.98);
   115	}
   116	
   117	.menuWrap {
   118	  position: relative;
   119	}
   120	
   121	.settingsMenu {
   122	  position: absolute;
   123	  bottom: calc(100% + 8px);
   124	  right: -8px;
   125	  width: 220px;
   126	  background: var(--surface-popover);
   127	  border: 1px solid var(--border-hairline);
   128	  border-radius: var(--radius-md);
   129	  padding: 10px;
   130	  color: var(--text-primary);
   131	  box-shadow: var(--shadow-3);
   132	  animation: menu-in var(--duration-fast) var(--ease-enter) both;
   133	}
   134	
   135	@keyframes menu-in {
   136	  from { opacity: 0; transform: translateY(4px) scale(.98); }
   137	  to { opacity: 1; transform: none; }
   138	}
   139	
   140	.menuSectionLabel {
   141	  font-size: var(--type-11);
   142	  text-transform: uppercase;
   143	  letter-spacing: .06em;
   144	  font-weight: var(--weight-medium);
   145	  color: var(--text-secondary);
   146	  margin-bottom: 6px;
   147	}
   148	
   149	.menuDivider {
   150	  height: 1px;
   151	  background: var(--border-hairline);
   152	  margin: 10px 0;
   153	}
   154	
   155	.rateGrid {
   156	  display: grid;
   157	  grid-template-columns: repeat(3, 1fr);
   158	  gap: 4px;
   159	}
   160	
   161	.rateOption {
   162	  background: transparent;
   163	  border: 1px solid var(--border-default);
   164	  color: var(--text-primary);
   165	  border-radius: var(--radius-sm);
   166	  padding: 5px 0;
   167	  font-size: var(--type-12);
   168	  cursor: pointer;
   169	  transition:
   170	    background-color var(--duration-fast) var(--ease-standard),
   171	    border-color var(--duration-fast) var(--ease-standard),
   172	    color var(--duration-fast) var(--ease-standard);
   173	}
   174	
   175	.rateOption:hover {
   176	  background: var(--hover-overlay);
   177	}
   178	
   179	.rateOption:active {
   180	  transform: scale(.96);
   181	}
   182	
   183	.rateOptionActive {
   184	  border-color: var(--accent-blue);
   185	  color: var(--accent-blue);
   186	}
   187	
   188	.loopRow {
   189	  display: flex;
   190	  flex-wrap: wrap;
   191	  gap: 6px;
   192	}
   193	
   194	.menuButton {
   195	  background: transparent;
   196	  border: 1px solid var(--border-default);
   197	  color: var(--text-primary);
   198	  border-radius: var(--radius-sm);
   199	  padding: 5px 8px;
   200	  font-size: var(--type-11);
   201	  cursor: pointer;
   202	  white-space: nowrap;
   203	  transition: background-color var(--duration-fast) var(--ease-standard);
   204	}
   205	
   206	.menuButton:hover:not(:disabled) {
   207	  background: var(--hover-overlay);
   208	}
   209	
   210	.menuButton:active:not(:disabled) {
   211	  transform: scale(.96);
   212	}
   213	
   214	.menuButton:disabled {
   215	  opacity: 0.4;
   216	  cursor: default;
   217	}

2026-07-28T23:36:45.428566Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_reasoning_summaries` at line 87 column 5
exec
/bin/zsh -lc "rg -n \"fake demo|Summary of the content|PEARLS|AI BREAKDOWN|No concept doc\" web/src server design -g '*.{ts,tsx,css,md}' | head -80; nl -ba web/src/concepts/AnalysisSections.tsx | sed -n '1,260p'" in /Users/antemo/studyloop
 succeeded in 0ms:
web/src/concepts/ConceptsDock.tsx:94:        <p className={styles.status}>No concept doc attached to this project.</p>
server/src/lib/analysis.ts:346:            insight: `A key point discussed around ${formatTimestamp(mid)} (fake demo data).`,
server/src/lib/analysis.ts:353:            summary: `Summary of the content between ${formatTimestamp(chunk.startSec)} and ${formatTimestamp(chunk.endSec)} (fake demo data).`,
server/src/lib/analysis.ts:385:            title: "Overarching theme (fake demo data)",
     1	// V2-C "Analysis engine" + "Overlays" (SPEC): the right-rail sections that
     2	// render the analysis engine's output. Composed into RightRail.tsx's
     3	// Concepts card (Pearls at the top, ConceptsDock's doc concepts in the
     4	// middle, "AI breakdown" + Themes below — SPEC: "'Pearls' group at top ...
     5	// themes at the bottom of the panel") plus a standalone "Others' analysis"
     6	// card for imported overlays.
     7	import { useState } from "react";
     8	import { useStudyLoopStore } from "../state/store";
     9	import { sortPearls, starStates, hashHueForHandle } from "../lib/analysisFormat";
    10	import { formatTimestamp } from "../lib/time";
    11	import { Icon } from "../components/icons";
    12	import type { Pearl } from "../lib/types";
    13	import styles from "./AnalysisSections.module.css";
    14	
    15	function StarRating({ importance }: { importance: 1 | 2 | 3 }): JSX.Element {
    16	  return (
    17	    <span className={styles.stars} aria-label={`Importance ${importance} of 3`}>
    18	      {starStates(importance).map((filled, i) => (
    19	        <Icon key={i} name={filled ? "star" : "starOutline"} size={12} />
    20	      ))}
    21	    </span>
    22	  );
    23	}
    24	
    25	export function PearlsSection(): JSX.Element | null {
    26	  const analysis = useStudyLoopStore((s) => s.analysis);
    27	  const controller = useStudyLoopStore((s) => s.controller);
    28	  const [expanded, setExpanded] = useState<Set<number>>(new Set());
    29	
    30	  if (!analysis || analysis.pearls.length === 0) return null;
    31	  const pearls = sortPearls(analysis.pearls);
    32	
    33	  const toggle = (i: number): void => {
    34	    setExpanded((cur) => {
    35	      const next = new Set(cur);
    36	      if (next.has(i)) next.delete(i);
    37	      else next.add(i);
    38	      return next;
    39	    });
    40	  };
    41	
    42	  return (
    43	    <section className={styles.section}>
    44	      <h3 className={styles.sectionHeader}>Pearls</h3>
    45	      <ul className={styles.list}>
    46	        {pearls.map((pearl: Pearl, i) => (
    47	          <li key={`${pearl.t}-${pearl.label}`} className={styles.pearlRow} onClick={() => toggle(i)}>
    48	            <div className={styles.pearlHead}>
    49	              <StarRating importance={pearl.importance} />
    50	              <button
    51	                type="button"
    52	                className={styles.timeChip}
    53	                onClick={(e) => {
    54	                  e.stopPropagation();
    55	                  controller?.seek(Math.max(0, pearl.t - 5));
    56	                }}
    57	              >
    58	                {formatTimestamp(pearl.t)}
    59	              </button>
    60	              <span className={styles.pearlLabel}>{pearl.label}</span>
    61	            </div>
    62	            {expanded.has(i) && <p className={styles.pearlInsight}>{pearl.insight}</p>}
    63	          </li>
    64	        ))}
    65	      </ul>
    66	    </section>
    67	  );
    68	}
    69	
    70	export function AiBreakdownSection(): JSX.Element | null {
    71	  const analysis = useStudyLoopStore((s) => s.analysis);
    72	  const controller = useStudyLoopStore((s) => s.controller);
    73	
    74	  if (!analysis || analysis.concepts.length === 0) return null;
    75	
    76	  return (
    77	    <section className={styles.section}>
    78	      <h3 className={styles.sectionHeader}>AI breakdown</h3>
    79	      <ul className={styles.list}>
    80	        {analysis.concepts.map((concept) => (
    81	          <li key={concept.id} className={styles.conceptRow}>
    82	            <p className={styles.conceptTitle}>{concept.title}</p>
    83	            <p className={styles.conceptSummary}>{concept.summary}</p>
    84	            <div className={styles.anchorRow}>
    85	              {concept.anchors.map((a, i) => (
    86	                <button key={i} type="button" className={styles.timeChip} onClick={() => controller?.seek(Math.max(0, a.t - 5))}>
    87	                  {formatTimestamp(a.t)}
    88	                </button>
    89	              ))}
    90	            </div>
    91	          </li>
    92	        ))}
    93	      </ul>
    94	    </section>
    95	  );
    96	}
    97	
    98	export function ThemesSection(): JSX.Element | null {
    99	  const analysis = useStudyLoopStore((s) => s.analysis);
   100	  if (!analysis || analysis.themes.length === 0) return null;
   101	
   102	  return (
   103	    <section className={styles.section}>
   104	      <h3 className={styles.sectionHeader}>Themes</h3>
   105	      <ul className={styles.list}>
   106	        {analysis.themes.map((theme) => (
   107	          <li key={theme.title} className={styles.themeRow}>
   108	            <p className={styles.themeTitle}>{theme.title}</p>
   109	            <p className={styles.themeBody}>{theme.body}</p>
   110	          </li>
   111	        ))}
   112	      </ul>
   113	    </section>
   114	  );
   115	}
   116	
   117	/** SPEC: "'Others' analysis' right-rail section grouped by handle (their pearls/notes read-only, click-seek)". */
   118	export function OthersAnalysisSection(): JSX.Element | null {
   119	  const overlays = useStudyLoopStore((s) => s.overlays);
   120	  const overlaysVisible = useStudyLoopStore((s) => s.overlaysVisible);
   121	  const controller = useStudyLoopStore((s) => s.controller);
   122	
   123	  if (!overlaysVisible || overlays.length === 0) return null;
   124	
   125	  return (
   126	    <section className={styles.section}>
   127	      <h3 className={styles.sectionHeader}>Others&rsquo; analysis</h3>
   128	      {overlays.map((overlay) => {
   129	        const hue = hashHueForHandle(overlay.bundle.shareHandle);
   130	        return (
   131	          <div key={overlay.fileName} className={styles.handleGroup}>
   132	            <div className={styles.handleHeader}>
   133	              <span className={styles.handleSwatch} style={{ background: `hsl(${hue}, 70%, 55%)` }} />
   134	              {overlay.bundle.shareHandle}
   135	            </div>
   136	            {overlay.bundle.pearls.length === 0 && overlay.bundle.bubbles.length === 0 && (
   137	              <p className={styles.empty}>No pearls or captures in this bundle.</p>
   138	            )}
   139	            {overlay.bundle.pearls.length > 0 && (
   140	              <ul className={styles.list}>
   141	                {sortPearls(overlay.bundle.pearls).map((pearl) => (
   142	                  <li key={`${pearl.t}-${pearl.label}`} className={styles.pearlRow}>
   143	                    <div className={styles.pearlHead}>
   144	                      <StarRating importance={pearl.importance} />
   145	                      <button type="button" className={styles.timeChip} onClick={() => controller?.seek(Math.max(0, pearl.t - 5))}>
   146	                        {formatTimestamp(pearl.t)}
   147	                      </button>
   148	                      <span className={styles.pearlLabel}>{pearl.label}</span>
   149	                    </div>
   150	                  </li>
   151	                ))}
   152	              </ul>
   153	            )}
   154	            {overlay.bundle.notes.trim() && <p className={styles.othersNotes}>{overlay.bundle.notes.trim()}</p>}
   155	          </div>
   156	        );
   157	      })}
   158	    </section>
   159	  );
   160	}

codex
Verdict: **reject this pass as “premium complete.”** The foundation is substantially better, but the result is around **6.5/10** against a first-party YouTube bar. The rail screenshot contains release-blocking layout corruption, and five binding acceptance criteria are not met.

## 1. Acceptance criteria

| Criterion | Result | Evidence |
|---|---|---|
| No emoji or Unicode glyph used as an interactive icon | **PASS** | Controls use the local SVG system. The remaining `×` is a playback-rate unit, not an icon. |
| Every interactive element has hover, active, focus-visible, and disabled behavior | **FAIL** | Several controls only implement hover: wordmark/menu items in [TopBar.module.css](/Users/antemo/studyloop/web/src/components/TopBar.module.css:14), Detach/doc buttons/time chips in [ConceptsDock.module.css](/Users/antemo/studyloop/web/src/concepts/ConceptsDock.module.css:47). Disabled opacity also varies between `.4`, `.5`, and `.6` instead of the specified 38% foreground treatment. |
| Keyboard users can reach seek markers, ticker dismissal, rail headers, and modal actions | **PASS** | Seek markers are real buttons in [SeekBar.tsx](/Users/antemo/studyloop/web/src/player/SeekBar.tsx:164); ticker dismissal and rail headers are buttons; the notation modal traps and restores focus. |
| Modal and panel exits remain visible rather than being cut off | **FAIL** | The rail expansion persists correctly, but modals still unmount immediately. [NotationModal.tsx](/Users/antemo/studyloop/web/src/notes/NotationModal.tsx:103) returns `null` as soon as state closes; Compile, Import, Share, and ConceptOverlay follow the same conditional-rendering pattern. There are opening animations but no working closing lifecycle. |
| No new hard-coded shadow or transition duration | **FAIL** | [SeekBar.module.css](/Users/antemo/studyloop/web/src/player/SeekBar.module.css:47) introduces a literal `box-shadow`. Add a marker-ring token. |
| Surfaces follow the layered surface system | **PASS** | Player, rail, modal, popover, and page surfaces generally map correctly. Compile/Share duplicate shells, but their actual assignments are valid. |
| Loading lists do not jump when skeletons resolve | **FAIL** | A global `.skeleton` exists in [index.css](/Users/antemo/studyloop/web/src/index.css:247), but no component uses it. Library, transcript, concepts, and related videos still render text-only loading states. |
| Reduced motion removes nonessential motion | **PASS** | The global reduced-motion override is present in [index.css](/Users/antemo/studyloop/web/src/index.css:275). |
| Player remains visually dominant | **PASS, narrowly** | The player remains the largest surface in [v2-d-watch.png](/Users/antemo/studyloop/design/v2-d-watch.png), although the concept ticker and overloaded rail are beginning to compete with it. |

**Total: 4 pass, 5 fail.**

## 2. Remaining non-premium tells

### P0 — Release blockers

1. **The Concepts rail visibly collides and overflows**

   In [v2-d-rail.png](/Users/antemo/studyloop/design/v2-d-rail.png), the concept-document input, Attach button, “AI breakdown,” and topic content occupy the same vertical space. This is not subtle polish debt; it looks broken.

   Cause: the 420px flex viewport contains multiple independently tall sections, while `.pane` and `.attachPane` claim `height: 100%` in [ConceptsDock.module.css](/Users/antemo/studyloop/web/src/concepts/ConceptsDock.module.css:1).

   Concrete fix:

   ```css
   .conceptsViewport {
     height: 420px;
     max-height: 420px;
     overflow-y: auto;
     display: block;
   }

   .pane,
   .attachPane {
     height: auto;
     min-height: 0;
   }

   .list,
   .docList {
     overflow: visible;
   }
   ```

   Make the entire Concepts body the single scroll owner. Do not nest a full-height concept dock after Pearls.

2. **Production UI exposes “fake demo data”**

   The rail literally shows summaries ending in “(fake demo data).” That instantly destroys first-party credibility. The strings originate in `server/src/lib/analysis.ts`.

   Concrete fix: add analysis provenance such as `analysis.source: "model" | "stub"` and do not render Pearls/AI breakdown/Themes for `stub` data outside development. Show a restrained “Run analysis to generate insights” recovery state instead.

3. **Modal exit behavior fails the binding acceptance criterion**

   Add a shared `usePresence(open, 180)` or `ModalShell` that keeps the dialog mounted as `data-state="closing"` until `animationend`. Apply it to Notation, Compile, Import, Share, and ConceptOverlay. CSS needs both:

   ```css
   .card[data-state="closing"] {
     animation: modal-out 180ms var(--ease-exit) both;
   }

   .overlay[data-state="closing"] {
     animation: backdrop-out 180ms var(--ease-exit) both;
   }
   ```

4. **The interaction matrix is incomplete**

   The global focus ring does not compensate for missing pressed and disabled states. Add explicit `:active:not(:disabled)` rules to wordmark, dropdown/menu items, Detach, document rows, and every time chip. Normalize disabled treatment globally and remove component-specific `.5/.6` opacity values.

### P1 — Strong premium gaps

1. **Local-video thumbnails still look like placeholders**

   [v2-d-home.png](/Users/antemo/studyloop/design/v2-d-home.png) is a wall of identical charcoal rectangles with generic video icons. First-party YouTube is image-led.

   Generate a representative frame during import/scan, render it as:

   ```tsx
   <img className={styles.thumbImage} src={video.thumbnailUrl} alt="" />
   ```

   ```css
   .thumbImage {
     width: 100%;
     height: 100%;
     object-fit: cover;
   }
   ```

   Keep the icon only as an actual failure fallback.

2. **Raw filenames are presented as product titles**

   `OpenGuardSeatedVolume1` and `HighPercentageGiPassesbyGordonRyan1` are prominent in the watch and home screenshots. Humanize local filenames before rendering: replace separators, split camel-case and letter/number boundaries, preserve known acronyms, and remove redundant trailing file indices where series metadata exists.

3. **Loading skeleton work is ornamental rather than functional**

   The skeleton CSS exists but has zero markup users. Introduce geometry-matched skeleton components for library cards, transcript rows, concepts, related videos, and capture previews. Until then, the acceptance criterion cannot pass.

4. **Player tooltips are still browser-native**

   Player controls rely on `title` attributes in [PlayerControls.tsx](/Users/antemo/studyloop/web/src/player/PlayerControls.tsx:150). Replace them with one delayed tooltip component: 450ms entrance, 120ms opacity/4px-Y motion, keyboard focus support, and edge clamping.

5. **The rail is over-composed**

   “Transcript,” “Concepts,” Pearls, document attachment, AI breakdown, themes, and Up Next are all competing in one 402px column. Even after fixing overflow, the default-expanded state is too busy.

   Default Transcript open and Concepts closed, or persist the last-open section while allowing only one large section open at once. A first-party product would not make users manage several simultaneous nested scroll regions.

6. **Modal styling is visually similar but structurally duplicated**

   Notation and Compile each define their own overlays, cards, headers, close buttons, and keyframes. Extracting a shared shell is necessary to prevent the next visual drift.

### P2 — Finish details

- Library titles are secondary gray until hover. YouTube titles are primary at rest; set `.cardTitle { color: var(--text-primary); }` and reserve hover for thumbnail brightness.
- Remove uppercase/letterspaced series names such as “GETTING SWOLE…”; sentence/title case will feel less like an admin taxonomy.
- Replace “Cancel (Esc)” with “Cancel”; expose the shortcut through tooltip or accessible description.
- The green “Transcript” label on every library card reads like diagnostic metadata. Use neutral secondary text such as “Transcript available,” or omit it when availability is the normal state.
- Standardize future comparison captures at one viewport. The new screenshots are 1280×800 while the earlier ones are 1440×900, which creates false size-regression signals.

## 3. Regressions versus earlier screenshots

### Definite regression

- **Concept rail integrity regressed badly.** [v2-c-analysis.png](/Users/antemo/studyloop/design/v2-c-analysis.png) has orderly, readable analysis rows. [v2-d-rail.png](/Users/antemo/studyloop/design/v2-d-rail.png) has overlapping attachment and analysis content. This is the clearest regression and must be fixed before approval.

### Not actual regressions

- The smaller player and tighter visible content in v2-d are primarily caused by the viewport changing from 1440×900 to 1280×800. The underlying 402px rail and 24px grid geometry are essentially unchanged.
- The black disclaimer frame versus the active grappling footage is playback-state/content variance, not a player-style regression.
- The run-together local titles already existed in v2-a/v2-c; they remain unfixed rather than newly regressing.

### Genuine improvements over v2-a/v2-c

- Emoji/glyph controls have been replaced by a coherent SVG vocabulary.
- Player chrome, scrim, seek grammar, focus treatment, rail surfaces, and modal hierarchy are noticeably more disciplined.
- The earlier native-looking volume/control treatment is substantially improved.

The fastest path to approval is: **fix rail overflow → hide stub analysis → implement modal presence → complete pressed/disabled states → add real thumbnails and title normalization.**
tokens used
149,303
Verdict: **reject this pass as “premium complete.”** The foundation is substantially better, but the result is around **6.5/10** against a first-party YouTube bar. The rail screenshot contains release-blocking layout corruption, and five binding acceptance criteria are not met.

## 1. Acceptance criteria

| Criterion | Result | Evidence |
|---|---|---|
| No emoji or Unicode glyph used as an interactive icon | **PASS** | Controls use the local SVG system. The remaining `×` is a playback-rate unit, not an icon. |
| Every interactive element has hover, active, focus-visible, and disabled behavior | **FAIL** | Several controls only implement hover: wordmark/menu items in [TopBar.module.css](/Users/antemo/studyloop/web/src/components/TopBar.module.css:14), Detach/doc buttons/time chips in [ConceptsDock.module.css](/Users/antemo/studyloop/web/src/concepts/ConceptsDock.module.css:47). Disabled opacity also varies between `.4`, `.5`, and `.6` instead of the specified 38% foreground treatment. |
| Keyboard users can reach seek markers, ticker dismissal, rail headers, and modal actions | **PASS** | Seek markers are real buttons in [SeekBar.tsx](/Users/antemo/studyloop/web/src/player/SeekBar.tsx:164); ticker dismissal and rail headers are buttons; the notation modal traps and restores focus. |
| Modal and panel exits remain visible rather than being cut off | **FAIL** | The rail expansion persists correctly, but modals still unmount immediately. [NotationModal.tsx](/Users/antemo/studyloop/web/src/notes/NotationModal.tsx:103) returns `null` as soon as state closes; Compile, Import, Share, and ConceptOverlay follow the same conditional-rendering pattern. There are opening animations but no working closing lifecycle. |
| No new hard-coded shadow or transition duration | **FAIL** | [SeekBar.module.css](/Users/antemo/studyloop/web/src/player/SeekBar.module.css:47) introduces a literal `box-shadow`. Add a marker-ring token. |
| Surfaces follow the layered surface system | **PASS** | Player, rail, modal, popover, and page surfaces generally map correctly. Compile/Share duplicate shells, but their actual assignments are valid. |
| Loading lists do not jump when skeletons resolve | **FAIL** | A global `.skeleton` exists in [index.css](/Users/antemo/studyloop/web/src/index.css:247), but no component uses it. Library, transcript, concepts, and related videos still render text-only loading states. |
| Reduced motion removes nonessential motion | **PASS** | The global reduced-motion override is present in [index.css](/Users/antemo/studyloop/web/src/index.css:275). |
| Player remains visually dominant | **PASS, narrowly** | The player remains the largest surface in [v2-d-watch.png](/Users/antemo/studyloop/design/v2-d-watch.png), although the concept ticker and overloaded rail are beginning to compete with it. |

**Total: 4 pass, 5 fail.**

## 2. Remaining non-premium tells

### P0 — Release blockers

1. **The Concepts rail visibly collides and overflows**

   In [v2-d-rail.png](/Users/antemo/studyloop/design/v2-d-rail.png), the concept-document input, Attach button, “AI breakdown,” and topic content occupy the same vertical space. This is not subtle polish debt; it looks broken.

   Cause: the 420px flex viewport contains multiple independently tall sections, while `.pane` and `.attachPane` claim `height: 100%` in [ConceptsDock.module.css](/Users/antemo/studyloop/web/src/concepts/ConceptsDock.module.css:1).

   Concrete fix:

   ```css
   .conceptsViewport {
     height: 420px;
     max-height: 420px;
     overflow-y: auto;
     display: block;
   }

   .pane,
   .attachPane {
     height: auto;
     min-height: 0;
   }

   .list,
   .docList {
     overflow: visible;
   }
   ```

   Make the entire Concepts body the single scroll owner. Do not nest a full-height concept dock after Pearls.

2. **Production UI exposes “fake demo data”**

   The rail literally shows summaries ending in “(fake demo data).” That instantly destroys first-party credibility. The strings originate in `server/src/lib/analysis.ts`.

   Concrete fix: add analysis provenance such as `analysis.source: "model" | "stub"` and do not render Pearls/AI breakdown/Themes for `stub` data outside development. Show a restrained “Run analysis to generate insights” recovery state instead.

3. **Modal exit behavior fails the binding acceptance criterion**

   Add a shared `usePresence(open, 180)` or `ModalShell` that keeps the dialog mounted as `data-state="closing"` until `animationend`. Apply it to Notation, Compile, Import, Share, and ConceptOverlay. CSS needs both:

   ```css
   .card[data-state="closing"] {
     animation: modal-out 180ms var(--ease-exit) both;
   }

   .overlay[data-state="closing"] {
     animation: backdrop-out 180ms var(--ease-exit) both;
   }
   ```

4. **The interaction matrix is incomplete**

   The global focus ring does not compensate for missing pressed and disabled states. Add explicit `:active:not(:disabled)` rules to wordmark, dropdown/menu items, Detach, document rows, and every time chip. Normalize disabled treatment globally and remove component-specific `.5/.6` opacity values.

### P1 — Strong premium gaps

1. **Local-video thumbnails still look like placeholders**

   [v2-d-home.png](/Users/antemo/studyloop/design/v2-d-home.png) is a wall of identical charcoal rectangles with generic video icons. First-party YouTube is image-led.

   Generate a representative frame during import/scan, render it as:

   ```tsx
   <img className={styles.thumbImage} src={video.thumbnailUrl} alt="" />
   ```

   ```css
   .thumbImage {
     width: 100%;
     height: 100%;
     object-fit: cover;
   }
   ```

   Keep the icon only as an actual failure fallback.

2. **Raw filenames are presented as product titles**

   `OpenGuardSeatedVolume1` and `HighPercentageGiPassesbyGordonRyan1` are prominent in the watch and home screenshots. Humanize local filenames before rendering: replace separators, split camel-case and letter/number boundaries, preserve known acronyms, and remove redundant trailing file indices where series metadata exists.

3. **Loading skeleton work is ornamental rather than functional**

   The skeleton CSS exists but has zero markup users. Introduce geometry-matched skeleton components for library cards, transcript rows, concepts, related videos, and capture previews. Until then, the acceptance criterion cannot pass.

4. **Player tooltips are still browser-native**

   Player controls rely on `title` attributes in [PlayerControls.tsx](/Users/antemo/studyloop/web/src/player/PlayerControls.tsx:150). Replace them with one delayed tooltip component: 450ms entrance, 120ms opacity/4px-Y motion, keyboard focus support, and edge clamping.

5. **The rail is over-composed**

   “Transcript,” “Concepts,” Pearls, document attachment, AI breakdown, themes, and Up Next are all competing in one 402px column. Even after fixing overflow, the default-expanded state is too busy.

   Default Transcript open and Concepts closed, or persist the last-open section while allowing only one large section open at once. A first-party product would not make users manage several simultaneous nested scroll regions.

6. **Modal styling is visually similar but structurally duplicated**

   Notation and Compile each define their own overlays, cards, headers, close buttons, and keyframes. Extracting a shared shell is necessary to prevent the next visual drift.

### P2 — Finish details

- Library titles are secondary gray until hover. YouTube titles are primary at rest; set `.cardTitle { color: var(--text-primary); }` and reserve hover for thumbnail brightness.
- Remove uppercase/letterspaced series names such as “GETTING SWOLE…”; sentence/title case will feel less like an admin taxonomy.
- Replace “Cancel (Esc)” with “Cancel”; expose the shortcut through tooltip or accessible description.
- The green “Transcript” label on every library card reads like diagnostic metadata. Use neutral secondary text such as “Transcript available,” or omit it when availability is the normal state.
- Standardize future comparison captures at one viewport. The new screenshots are 1280×800 while the earlier ones are 1440×900, which creates false size-regression signals.

## 3. Regressions versus earlier screenshots

### Definite regression

- **Concept rail integrity regressed badly.** [v2-c-analysis.png](/Users/antemo/studyloop/design/v2-c-analysis.png) has orderly, readable analysis rows. [v2-d-rail.png](/Users/antemo/studyloop/design/v2-d-rail.png) has overlapping attachment and analysis content. This is the clearest regression and must be fixed before approval.

### Not actual regressions

- The smaller player and tighter visible content in v2-d are primarily caused by the viewport changing from 1440×900 to 1280×800. The underlying 402px rail and 24px grid geometry are essentially unchanged.
- The black disclaimer frame versus the active grappling footage is playback-state/content variance, not a player-style regression.
- The run-together local titles already existed in v2-a/v2-c; they remain unfixed rather than newly regressing.

### Genuine improvements over v2-a/v2-c

- Emoji/glyph controls have been replaced by a coherent SVG vocabulary.
- Player chrome, scrim, seek grammar, focus treatment, rail surfaces, and modal hierarchy are noticeably more disciplined.
- The earlier native-looking volume/control treatment is substantially improved.

The fastest path to approval is: **fix rail overflow → hide stub analysis → implement modal presence → complete pressed/disabled states → add real thumbnails and title normalization.**
