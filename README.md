# Harvous

A Bible study notes app. Trying to help you organize, remember, and keep findable what you learn—for a practice that isn't just on Sundays.

---

## About Me & Why Harvous Exists

Hey, I'm **Derek Castelli**. I'm a designer who's been designing websites and making them in Webflow since 2018. I'm also a believer since 2016, and this is my first app—something I've dreamed of making for years.

Harvous started during a house church event where I received a prophetic word with the key scripture being **Proverbs 25:2**. As a designer and new believer, I wondered how I could positively impact Bible study. I was learning every Sunday morning, but I struggled to remember what we covered the week before. I needed a better practice—something that extended beyond Sunday mornings.

So in 2022, I started working on this. It's gone through many iterations (it was actually going to be a ["Duolingo for Bible study"](https://www.reddit.com/r/Episcopalian/comments/1agt3xt/comment/nk4yzk1/?context=3) before those started being more prevalnet) before arriving where it is now—a Bible notes app that is thoughtful and good.

As I continue to work on Harvous, I think about where I was in 2015, one of the darkest times of my life. I think about my wife's friend in the UK who is getting more and more curious about God. For how beautiful God is, some software that helps people remember and know more about the Bible deserves, in my opinion, to also be beautiful.

---

## What is Harvous?

Harvous is a Bible study notes application designed specifically for people who want to organize their spiritual study in a meaningful way. Unlike generic note-taking apps, Harvous understands that Bible study has unique needs:

- **Flexible Organization**: Hierarchical system with Spaces → Threads → Notes that adapts to how you think
- **Rich Text Editing**: Modern Tiptap editor with formatting options
- **Auto-Tagging**: Intelligent tagging with 1000+ biblical keywords
- **Scripture Detection**: Automatic detection and parsing of Bible references
- **Multi-Thread Support**: Notes can belong to multiple threads (because Bible study topics naturally overlap)
- **PWA Ready**: Installable on mobile and desktop

Think of Harvous like a digital filing cabinet specifically designed for Bible study, where:
- **Spaces** are like the main drawers (Bible Study, Prayer Journal, Sermon Notes)
- **Threads** are like collections within those drawers (Gospel of John, Romans Study, Daily Prayers)
- **Notes** are like individual documents in those collections (your thoughts, insights, and reflections)

---

## Documentation

Complete documentation is available in the [`docs/`](./docs/) directory:

### Quick Links

- **[docs/README.md](./docs/README.md)** - Documentation index
- **[docs/GETTING_STARTED.md](./docs/GETTING_STARTED.md)** - Setup and development guide
- **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** - System architecture
- **[docs/DATABASE.md](./docs/DATABASE.md)** - Database schema
- **[docs/COMPONENTS.md](./docs/COMPONENTS.md)** - Component system
- **[docs/DATA_FLOW.md](./docs/DATA_FLOW.md)** - Data flow diagrams
- **[docs/API.md](./docs/API.md)** - API reference
- **[docs/FEATURES.md](./docs/FEATURES.md)** - Feature documentation
- **[docs/USER_GUIDE.md](./docs/USER_GUIDE.md)** - User guide
- **[docs/TECH_STACK.md](./docs/TECH_STACK.md)** - Technology stack
- **[docs/PROJECT_STRUCTURE.md](./docs/PROJECT_STRUCTURE.md)** - Project organization
- **[docs/HOW_IT_WORKS.md](./docs/HOW_IT_WORKS.md)** - Complete guide explaining how everything works

### Documentation Categories

- **Getting Started**: Setup, development, and quick start guides
- **Architecture & Design**: System architecture, database schema, components, data flows
- **API & Development**: API reference, development guides, best practices
- **Features**: Feature documentation, user guides, how-to guides
- **Component Docs**: Component-specific documentation

---

## Development

You are welcome—and encouraged—to modify Harvous to your liking. Please see our [Development guide](./docs/GETTING_STARTED.md) for how to get Harvous set up for local development.

---

## How to Contribute

We welcome contributions! Please read our [development guide](./docs/GETTING_STARTED.md) and [architecture documentation](./docs/ARCHITECTURE.md) before submitting code. For code style and patterns, see our [refactoring plan](./docs/REFACTORING_PLAN.md), [component docs](./docs/COMPONENTS.md), and [tech stack](./docs/TECH_STACK.md).

---

## License

This project is licensed under the [O'Saasy License](https://world.hey.com/dhh/the-o-saasy-license-336c5c8f) - see the [LICENSE](LICENSE) file for details.

The O'Saasy License was created by [David Heinemeier Hansson (DHH)](https://world.hey.com/dhh/the-o-saasy-license-336c5c8f) and the team at 37signals. It's basically the do-whatever-you-want MIT license, but with the commercial rights to run the software as a service (SaaS) reserved for the copyright holder, thus encouraging more code to be open source while allowing the original creators to see a return on their investment.

**Summary**: MIT-like license that allows use, modification, and distribution, but reserves the right to offer this software as a hosted SaaS product exclusively for Testament Made, LLC.

---

## Credits

Many thanks to my friends **Cameron Pak** and **Corey Moen** for their initial support and continued encouragement. Also shoutout to the very first users who have provided oh so helpful feedback.

Also, Harvous is continuously inspired by the work of 37signals. We use [HEY](https://hey.com) for email and [Fizzy](https://fizzy.do) to get work done, and we're grateful for their commitment to building thoughtful software and supporting the open source community.

Oh and... animation in Harvous takes inspiration from Emil Kowalski of [Animations.dev](https://animations.dev).

## Technologies

- **Frontend**: [React](https://react.dev) SPA ([Vite](https://vite.dev), [TanStack Router](https://tanstack.com/router), [TanStack Query](https://tanstack.com/query/latest), [Clerk](https://clerk.com))
- **Backend**: [Hono](https://hono.dev) API in `server/`, deployed as one [Netlify](https://netlify.com) serverless function for `/api/*`
- **Database**: [Supabase](https://supabase.com) PostgreSQL with [Drizzle](https://orm.drizzle.team) ORM
- **UI**: [Tiptap](https://tiptap.dev), [Radix UI](https://radix-ui.com), vanilla CSS
- **Tooling**: TypeScript, [Vitest](https://vitest.dev), [Playwright](https://playwright.dev), [Capacitor](https://capacitorjs.com) (PWA/native)

Details, versions, and deployment: [docs/TECH_STACK.md](./docs/TECH_STACK.md).

---

**Version:** 2.14.11
**Status:** Official 1.0 Released January 8, 2026
