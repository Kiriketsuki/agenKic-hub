# Agent Catalog

Full categorized list of available agents. Read this when the quick routing table in SKILL.md doesn't cover the domain.

## Table of Contents

- [Built-in Agents](#built-in-agents)
- [Engineering](#engineering)
- [Design & UX](#design--ux)
- [Testing & QA](#testing--qa)
- [Project Management](#project-management)
- [Product](#product)
- [Marketing & Social](#marketing--social)
- [Sales](#sales)
- [Paid Media & Advertising](#paid-media--advertising)
- [Game Development](#game-development)
- [XR & Spatial Computing](#xr--spatial-computing)
- [Specialized](#specialized)
- [Plugin-Provided](#plugin-provided)
- [Pipeline Phases](#pipeline-phases)

---

## Built-in Agents

These are part of Claude Code core. No agent file needed.

| subagent_type | Use For |
|:---|:---|
| `general-purpose` | Default. Research, multi-step tasks, anything without a specialist |
| `Explore` | Fast codebase search, file pattern matching, keyword search |
| `Plan` | Architecture planning, implementation strategy, trade-off analysis |
| `claude-code-guide` | Questions about Claude Code features, SDK, API |
| `statusline-setup` | Configure the statusline |

## Engineering

| Agent Name (subagent_type) | Domain |
|:---|:---|
| `Software Architect` | System design, DDD, architectural decisions |
| `Backend Architect` | Server-side architecture, APIs, microservices |
| `Frontend Developer` | Modern web, React/Vue/Angular, UI implementation |
| `Senior Developer` | Full-stack implementation, Laravel/Livewire/FluxUI, Three.js |
| `Code Reviewer` | Constructive code review focused on correctness and security |
| `Security Engineer` | Threat modeling, vulnerability assessment, secure code review |
| `DevOps Automator` | CI/CD pipelines, infrastructure automation |
| `SRE` | SLOs, error budgets, observability, chaos engineering |
| `Database Optimizer` | Schema design, query optimization, indexing |
| `Data Engineer` | Data pipelines, ETL/ELT, Spark, dbt, lakehouse |
| `AI Engineer` | ML model development, deployment, AI-powered features |
| `Git Workflow Master` | Git workflows, branching, conventional commits |
| `Technical Writer` | Developer docs, API references, READMEs |
| `Incident Response Commander` | Production incidents, post-mortems, SLO tracking |
| `Rapid Prototyper` | Ultra-fast MVP/POC development |
| `Mobile App Builder` | Native iOS/Android, cross-platform frameworks |
| `Embedded Firmware Engineer` | ESP32, STM32, FreeRTOS, Zephyr, PlatformIO |
| `Solidity Smart Contract Engineer` | EVM smart contracts, DeFi, gas optimization |
| `Threat Detection Engineer` | SIEM rules, MITRE ATT&CK, detection-as-code |
| `Autonomous Optimization Architect` | Performance shadow-testing, cost guardrails |
| `Feishu Integration Developer` | Feishu/Lark bots, workflows, Bitable |
| `WeChat Mini Program Developer` | WeChat Mini Programs, WXML/WXSS |
| `LSP/Index Engineer` | Language Server Protocol, semantic indexing |
| `Terminal Integration Specialist` | Terminal emulation, SwiftTerm |
| `MCP Builder` | MCP server design, tools, resources, prompts |
| `Blockchain Security Auditor` | Smart contract auditing, exploit analysis |
| `Compliance Auditor` | SOC 2, ISO 27001, HIPAA, PCI-DSS |
| `Jira Workflow Steward` | Jira-linked Git workflows, traceable commits |

## Design & UX

| Agent Name (subagent_type) | Domain |
|:---|:---|
| `UI Designer` | Visual design systems, component libraries |
| `UX Architect` | Technical architecture + UX, CSS systems |
| `UX Researcher` | Usability testing, user behavior analysis |
| `Visual Storyteller` | Visual narratives, multimedia content |
| `Brand Guardian` | Brand identity, consistency |
| `Image Prompt Engineer` | AI image generation prompts |
| `Inclusive Visuals Specialist` | Culturally accurate, non-stereotypical imagery |
| `Whimsy Injector` | Personality, delight, playful elements |

## Testing & QA

| Agent Name (subagent_type) | Domain |
|:---|:---|
| `diagnosis` | Evidence-based root-cause analysis (read-only) |
| `Accessibility Auditor` | WCAG audits, screen reader testing |
| `API Tester` | API validation, performance testing |
| `Evidence Collector` | QA evidence gathering (screenshot-obsessed) |
| `Performance Benchmarker` | System performance measurement |
| `Reality Checker` | Production readiness certification |
| `Test Results Analyzer` | Test result evaluation, quality metrics |
| `Tool Evaluator` | Technology assessment, tool recommendations |
| `Workflow Optimizer` | Process improvement, automation |

## Project Management

| Agent Name (subagent_type) | Domain |
|:---|:---|
| `Agents Orchestrator` | Full pipeline orchestration (PM to ship) |
| `Senior Project Manager` | Specs to tasks, scope management |
| `Project Shepherd` | Cross-functional coordination, timeline management |
| `Studio Producer` | Multi-project portfolio, resource allocation |
| `Studio Operations` | Day-to-day studio efficiency |
| `Experiment Tracker` | A/B tests, hypothesis validation |

## Product

| Agent Name (subagent_type) | Domain |
|:---|:---|
| `Sprint Prioritizer` | Sprint planning, feature prioritization |
| `Trend Researcher` | Emerging trends, competitive analysis |
| `Feedback Synthesizer` | User feedback analysis, product insights |
| `Behavioral Nudge Engine` | Behavioral psychology, motivation design |

## Marketing & Social

| Agent Name (subagent_type) | Domain |
|:---|:---|
| `Content Creator` | Multi-platform campaigns, editorial calendars |
| `Social Media Strategist` | Cross-platform social strategy |
| `LinkedIn Content Creator` | LinkedIn thought leadership |
| `Twitter Engager` | Twitter engagement, thread creation |
| `TikTok Strategist` | TikTok content, algorithm optimization |
| `Instagram Curator` | Visual storytelling, multi-format content |
| `Reddit Community Builder` | Reddit engagement, community building |
| `SEO Specialist` | Technical SEO, organic growth |
| `Growth Hacker` | Rapid user acquisition, viral loops |
| `App Store Optimizer` | ASO, conversion optimization |
| `Douyin Strategist` | Douyin short-video, livestream commerce |
| `Xiaohongshu Specialist` | Xiaohongshu lifestyle content |
| `Bilibili Content Strategist` | Bilibili UP growth, danmaku culture |
| `Weibo Strategist` | Weibo trending, fan economy |
| `Zhihu Strategist` | Zhihu thought leadership, Q&A |
| `Kuaishou Strategist` | Kuaishou content, lower-tier markets |
| `WeChat Official Account Manager` | WeChat OA content, subscriber engagement |
| `Livestream Commerce Coach` | Live selling, host training |
| `Podcast Strategist` | Audio content, podcast growth |
| `Short-Video Editing Coach` | Post-production, CapCut/Premiere/DaVinci |
| `Book Co-Author` | Thought-leadership book collaboration |
| `Carousel Growth Engine` | TikTok/Instagram carousel automation |
| `Private Domain Operator` | WeCom SCRM, community operations |

## Sales

| Agent Name (subagent_type) | Domain |
|:---|:---|
| `Deal Strategist` | MEDDPICC qualification, win planning |
| `Sales Engineer` | Technical discovery, demo engineering |
| `Sales Coach` | Rep development, call coaching |
| `Discovery Coach` | Discovery methodology, question design |
| `Pipeline Analyst` | Pipeline health, forecast accuracy |
| `Account Strategist` | Land-and-expand, QBR facilitation |
| `Outbound Strategist` | Multi-channel prospecting, ICP definition |
| `Proposal Strategist` | RFP response, win narratives |
| `Sales Data Extraction Agent` | Excel monitoring, sales metrics extraction |
| `Data Consolidation Agent` | Sales data consolidation, dashboards |
| `Report Distribution Agent` | Automated report distribution |

## Paid Media & Advertising

| Agent Name (subagent_type) | Domain |
|:---|:---|
| `PPC Campaign Strategist` | Google/Microsoft/Amazon search & shopping |
| `Paid Social Strategist` | Meta/LinkedIn/TikTok paid social |
| `Ad Creative Strategist` | Ad copywriting, RSA optimization |
| `Programmatic & Display Buyer` | Programmatic, DV360, ABM display |
| `Paid Media Auditor` | Cross-platform account audits |
| `Search Query Analyst` | Search term analysis, negative keywords |
| `Tracking & Measurement Specialist` | Conversion tracking, GTM, attribution |

## Game Development

| Agent Name (subagent_type) | Domain |
|:---|:---|
| `Game Designer` | GDD, player psychology, economy balancing |
| `Level Designer` | Layout theory, encounter design |
| `Narrative Designer` | Branching dialogue, lore architecture |
| `Technical Artist` | Shaders, VFX, LOD, asset optimization |
| `Game Audio Engineer` | FMOD/Wwise, adaptive music, spatial audio |
| **Unity** | |
| `Unity Architect` | ScriptableObjects, decoupled systems |
| `Unity Shader Graph Artist` | Shader Graph, HLSL, URP/HDRP |
| `Unity Multiplayer Engineer` | Netcode, Relay/Lobby, state sync |
| `Unity Editor Tool Developer` | Custom editors, pipeline automation |
| **Unreal** | |
| `Unreal Systems Engineer` | C++/Blueprint, Nanite, Lumen, GAS |
| `Unreal Technical Artist` | Material Editor, Niagara, PCG |
| `Unreal Multiplayer Architect` | Actor replication, dedicated servers |
| `Unreal World Builder` | World Partition, Landscape, HLOD |
| **Godot** | |
| `Godot Gameplay Scripter` | GDScript 2.0, C#, signal design |
| `Godot Shader Developer` | Godot Shading Language, VisualShader |
| `Godot Multiplayer Engineer` | MultiplayerAPI, ENet/WebRTC, RPCs |
| **Roblox** | |
| `Roblox Systems Scripter` | Luau, RemoteEvents, DataStore |
| `Roblox Experience Designer` | Engagement loops, monetization |
| `Roblox Avatar Creator` | UGC items, avatar rigging |

## XR & Spatial Computing

| Agent Name (subagent_type) | Domain |
|:---|:---|
| `visionOS Spatial Engineer` | visionOS, SwiftUI volumetric, Liquid Glass |
| `macOS Spatial/Metal Engineer` | Swift, Metal, 3D rendering |
| `XR Immersive Developer` | WebXR, browser-based AR/VR |
| `XR Interface Architect` | Spatial interaction design |
| `XR Cockpit Interaction Specialist` | Cockpit-based XR control systems |

## Specialized

| Agent Name (subagent_type) | Domain |
|:---|:---|
| `ZK Steward` | Zettelkasten knowledge-base, atomic notes |
| `Document Generator` | PDF/PPTX/DOCX/XLSX generation |
| `Developer Advocate` | Developer communities, DX optimization |
| `Model QA Specialist` | ML model auditing, calibration testing |
| `Cultural Intelligence Strategist` | Cross-cultural inclusion, invisible exclusion |
| `Identity Graph Operator` | Entity resolution across multi-agent systems |
| `Agentic Identity & Trust Architect` | AI agent identity, auth, trust verification |
| `Executive Summary Generator` | SCQA/Pyramid Principle executive summaries |
| `Analytics Reporter` | Dashboards, KPIs, data visualization |
| `Finance Tracker` | Financial planning, budget management |
| `Infrastructure Maintainer` | System reliability, technical operations |
| `Support Responder` | Customer support, issue resolution |
| `Legal Compliance Checker` | Laws, regulations, industry standards |
| `Corporate Training Designer` | Training programs, instructional design |
| `Recruitment Specialist` | Talent acquisition, hiring platforms |
| `Supply Chain Strategist` | Supplier development, sourcing |
| `Study Abroad Advisor` | International study planning |
| `Healthcare Marketing Compliance` | China healthcare advertising law |
| `Government Digital Presales Consultant` | China government IT presales |
| `Cross-Border E-Commerce Specialist` | Amazon/Shopee/Lazada cross-border ops |
| `China E-Commerce Operator` | Taobao/Tmall/PDD/JD operations |
| `Accounts Payable Agent` | Vendor payments, crypto/fiat processing |

## Plugin-Provided

These come from installed Claude Code plugins. Use the fully qualified name.

| subagent_type | Domain |
|:---|:---|
| `pr-review-toolkit:type-design-analyzer` | Type design quality, encapsulation |
| `pr-review-toolkit:silent-failure-hunter` | Silent failures, error handling gaps |
| `pr-review-toolkit:code-simplifier` | Code clarity, consistency |
| `pr-review-toolkit:code-reviewer` | Project guideline adherence |
| `pr-review-toolkit:comment-analyzer` | Comment accuracy, maintainability |
| `pr-review-toolkit:pr-test-analyzer` | Test coverage quality |
| `coderabbit:code-reviewer` | CodeRabbit AI code review |
| `superpowers:code-reviewer` | Plan-aligned code review |

## Pipeline Phases

These agents correspond to project lifecycle phases (used by `Agents Orchestrator`):

| Agent | Phase |
|:---|:---|
| `phase-0-discovery` | Discovery & research |
| `phase-1-strategy` | Strategy & planning |
| `phase-2-foundation` | Foundation setup |
| `phase-3-build` | Implementation |
| `phase-4-hardening` | Testing & hardening |
| `phase-5-launch` | Launch preparation |
| `phase-6-operate` | Operations & monitoring |
