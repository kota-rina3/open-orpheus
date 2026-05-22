# 参与贡献 Open Orpheus

[English Version](docs/CONTRIBUTING_en.md)

首先，感谢你愿意花时间为 Open Orpheus 做贡献！不论是提交 issue、改进文档还是贡献代码，每一份帮助都十分珍贵。

## 目录

- [行为准则](#行为准则)
- [提交 Issue](#提交-issue)
- [提交 Pull Request](#提交-pull-request)
- [开发环境搭建](#开发环境搭建)

## 行为准则

请保持友好、包容的交流态度。我们希望 Open Orpheus 对所有人都是一个友好的开源社区。详见 [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)。

## 提交 Issue

Issue 是反馈 Bug、提出功能建议或讨论项目方向的主要渠道。提交前请先搜索现有 issue，避免重复。

### 报告 Bug

请尽量提供以下信息：

- **操作系统及版本**（如 Fedora 42、Windows 11）
- **桌面环境** （如果是 Linux 操作系统）
- **Open Orpheus 版本**
- **复现步骤**：能稳定复现的最小步骤
- **预期行为** vs **实际行为**
- **相关日志或截图**（如有）

> 请勿在 issue 中包含任何账号、密码或个人隐私信息。

### 功能建议

欢迎提出新功能的想法！请描述：

- 你希望实现什么效果
- 这个功能对哪些用户有帮助
- 你是否愿意参与实现

请注意，本项目的核心目标是**互操作性**，不会接受任何用于绕过广告、付费内容或 DRM 的功能。

## 提交 Pull Request

1. Fork 本仓库，并基于 `main` 分支创建你的分支（如 `feat/my-feature` 或 `fix/some-bug`）。
2. 完成修改后，确保代码可以正常构建和运行。
3. 提交 PR 时请简要描述改动内容及动机。
4. 如果你的 PR 关联了某个 issue，请在描述中用 `Closes #issue号` 关联。
5. 等待 review。维护者可能会提出修改建议，请保持耐心。

### 代码风格

- TypeScript / JavaScript：项目使用 ESLint，提交前请确保没有 lint 错误（`pnpm lint`），并且确保代码已格式化（`pnpm format`）。
- Rust：遵循标准 `rustfmt` 风格（`cargo fmt`）。
- 提交信息格式建议参考 [Conventional Commits](https://www.conventionalcommits.org/)。

## 开发环境搭建

如果你要参与开发，需要先准备好 Node 和 Rust（推荐 Node v24、Rust 1.92）。

根项目这边的工作流和普通的 Electron Forge 项目差不多，不过 Open Orpheus 自己有一些原生模块，所以还得多做几步配置。

下面的步骤默认使用 `pnpm` 作为 Node 的包管理器，我们不建议使用其他包管理器。

### 安装依赖

在根目录执行一次即可，pnpm workspace 会自动为所有包（包括原生模块）安装依赖：

```sh
pnpm install
```

### 构建模块

`modules` 文件夹里有几个 Open Orpheus 运行所需的原生模块。

在根目录执行：

```sh
pnpm build:modules # 构建所有模块（会同时构建 Rust 和 Node 代码）
```

### 启动开发模式

```sh
pnpm start
```

这会以开发模式启动 Electron 应用，支持热重载（renderer 部分）。
