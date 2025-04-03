# Contributing to BrowserState

Thanks for your interest in contributing!

BrowserState is designed to be a **minimal, reliable foundation** for browser automation. We welcome ideas, bug reports, and improvements that align with that mission.

---

## 🧠 Philosophy

BrowserState is not a framework or an automation toolkit—it’s a low-level library that focuses on:
- Persisting and restoring browser sessions
- Running automation reliably across environments (local, CI, cloud)
- Supporting multiple storage backends like local, Redis, and S3
- Keeping things portable and language-agnostic

We aim to keep the core small, composable, and predictable.

If you have a great idea that expands what BrowserState enables—like tools for orchestration, debugging, or auth flows—we recommend building it **on top of this library**, not inside it.

---

## 🧑‍💻 Who Should Contribute Code

BrowserState is infrastructure code. We mostly look for contributors with experience in:
- Browser automation (Playwright, Puppeteer, Selenium)
- Infrastructure tooling
- Cross-environment reliability and storage systems

If you're earlier in your journey, you're still welcome to:
- **Report bugs**
- **Open feature requests**
- **Suggest improvements in Discussions**

We actively respond to issues, even if they don’t result in code changes.

---

## ✅ Contribution Guidelines

- All PRs should be production-ready and tested across supported storage backends.
- Keep TypeScript and Python APIs in sync for core functionality.
- Prefer clarity and stability over abstractions or shortcuts.
- New features must relate to **browser state management**—we try to avoid bundling unrelated logic.
- Feel free to build additional tools or wrappers **on top**, outside this repo.

---

## 📦 Inspiration & Precedents

We take inspiration from projects that stay tightly scoped and reliable:
- [esbuild](https://github.com/evanw/esbuild)
- [redis-py](https://github.com/redis/redis-py)
- [pnpm](https://github.com/pnpm/pnpm)

They focus on doing one thing extremely well—and that’s our goal too.

---

Thanks again for helping improve BrowserState. Thoughtful contributions make all the difference.
