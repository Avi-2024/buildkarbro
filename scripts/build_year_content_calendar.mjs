import crypto from "node:crypto";

const START_DATE = "2026-09-11";
const DAYS = 365;
const TIMEZONE = "Asia/Kolkata";
const DEFAULT_PUBLISH_TIME = "09:00";

const monthlyThemes = [
  "AI + Creator Discipline",
  "Freelance Starter Systems",
  "Student Productivity + Skill Building",
  "AI Workflows for Work",
  "Creator Growth + Personal Brand",
  "Business Systems for Beginners",
  "Money Skills + Digital Products",
  "Coding, No-Code + Automation",
  "Client Acquisition + Sales",
  "Execution, Focus + Shipping",
  "Content Repurposing + Distribution",
  "Build Kar Bro Year-End Growth Sprint"
];

const pillars = [
  "AI Tools",
  "AI Workflows",
  "Freelancing",
  "Creator Growth",
  "Student Productivity",
  "Business Systems",
  "Money Skills",
  "Coding / No-Code",
  "Execution Mindset"
];

const formats = [
  "6-slide Carousel",
  "7-slide Carousel",
  "Checklist Carousel",
  "Framework Carousel",
  "Story Carousel",
  "Meme Carousel",
  "Reel Script"
];

const topicsByPillar = {
  "AI Tools": [
    "5 AI tools Indian creators can actually use daily",
    "Free AI tools that replace boring daily tasks",
    "ChatGPT vs Gemini vs Claude: what to use for what",
    "AI tools for students who want smarter study systems",
    "AI tools for freelancers to look more premium",
    "AI tools that help you create content faster",
    "AI tools for research, writing and planning",
    "AI tools that save time without making you lazy"
  ],
  "AI Workflows": [
    "The AI workflow that saves 2 hours daily",
    "Turn one idea into 10 content pieces using AI",
    "The prompt framework beginners should copy",
    "How to use AI like a teammate, not a search box",
    "Build a weekly content system using AI",
    "Use AI to plan, create, review and improve",
    "The 4-step AI workflow for serious creators",
    "AI automation ideas for solo founders"
  ],
  "Freelancing": [
    "How to look premium as a new freelancer",
    "The simple freelance portfolio nobody builds",
    "Cold DM mistakes that kill client trust",
    "How to turn skills into service packages",
    "What to send after a client says send details",
    "How to price your first digital service",
    "Why clients ignore generic freelancers",
    "Freelancer daily routine for getting clients"
  ],
  "Creator Growth": [
    "Why your content is not getting saves",
    "The creator system better than random posting",
    "How to create hooks that stop scrolling",
    "How to turn boring knowledge into content",
    "Why small creators should document not flex",
    "How to build trust without showing your face",
    "The content pillar system for beginners",
    "One post idea, five angles"
  ],
  "Student Productivity": [
    "Study system for students using AI",
    "How students can build proof while studying",
    "Stop collecting courses and start building",
    "The weekly skill-building plan for students",
    "How to learn faster using projects",
    "Resume proof students can build in 30 days",
    "The anti-procrastination system for students",
    "How to use AI for notes without copying"
  ],
  "Business Systems": [
    "Small business systems that save daily time",
    "How to turn leads into follow-ups",
    "Why business owners need simple CRM thinking",
    "The no-confusion sales pipeline for beginners",
    "How to make any service look more professional",
    "Daily operations checklist for small business",
    "How to reduce manual work using simple automations",
    "The business dashboard every founder should track"
  ],
  "Money Skills": [
    "Digital product ideas beginners can sell",
    "How to turn templates into a small income product",
    "Why earning starts with solving one painful problem",
    "The ₹99 product strategy for beginners",
    "How to package knowledge into a product",
    "What to sell if you have no audience yet",
    "How to validate a product before building it",
    "The simple offer formula for creators"
  ],
  "Coding / No-Code": [
    "Build small tools instead of only watching tutorials",
    "No-code automation ideas for beginners",
    "How developers can use AI without becoming dependent",
    "The beginner project system for coding skills",
    "How to ship a mini app in 7 days",
    "Coding portfolio ideas clients understand",
    "Automate repetitive work with simple scripts",
    "Build before you overthink the stack"
  ],
  "Execution Mindset": [
    "17 ideas, 0 finished: the real problem",
    "One project for 7 days: the creator challenge",
    "Why discipline beats motivation for online growth",
    "Stop starting, start finishing",
    "The boring system behind visible success",
    "How to avoid shiny object syndrome",
    "Make proof before making announcements",
    "The daily 90-minute build block"
  ]
};

const hooks = [
  "Most people do this wrong:",
  "Bhai, ye samajh lo:",
  "If you want growth, stop ignoring this:",
  "This one shift can save hours:",
  "You don't need more motivation. You need this:",
  "Simple but powerful:",
  "Beginner-friendly, but serious result:",
  "Save this before you forget:"
];

const truths = [
  "Tools save time only when you use them inside a workflow.",
  "Stop collecting ideas. Start creating proof.",
  "Growth comes from repeatable systems, not random motivation.",
  "Premium work is mostly clear thinking plus consistent execution.",
  "One focused project beats ten half-started ideas.",
  "Your process should be simple enough to repeat daily.",
  "People trust proof more than promises.",
  "Small daily output compounds faster than perfect planning."
];

const ctas = [
  "Save this + follow @buildkarbro",
  "Comment BRO if you want more",
  "Share this with your ambitious friend",
  "Follow @buildkarbro for practical growth",
  "Try this for 7 days",
  "Build it. Post it. Improve it."
];

const hashtagMap = {
  "AI Tools": "#AI #AITools #ChatGPT #CreatorTools #BuildKarBro #IndiaCreators #Productivity",
  "AI Workflows": "#AIWorkflow #PromptEngineering #ChatGPT #Automation #BuildKarBro #Creators #India",
  "Freelancing": "#Freelancing #ClientAcquisition #FreelancerLife #BuildKarBro #IndianFreelancer #OnlineBusiness",
  "Creator Growth": "#CreatorGrowth #ContentCreation #BuildKarBro #InstagramGrowth #PersonalBrand #IndiaCreators",
  "Student Productivity": "#StudentLife #Productivity #CareerGrowth #BuildKarBro #SkillBuilding #StudentsIndia",
  "Business Systems": "#BusinessSystems #SmallBusiness #Automation #BuildKarBro #EntrepreneurIndia #CRM",
  "Money Skills": "#DigitalProducts #OnlineIncome #CreatorBusiness #BuildKarBro #SideIncome #MoneySkills",
  "Coding / No-Code": "#Coding #NoCode #Automation #BuildKarBro #DeveloperLife #BuildInPublic",
  "Execution Mindset": "#Execution #Focus #BuildInPublic #BuildKarBro #Productivity #CreatorLife"
};

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 58);
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getDayName(dateString) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(new Date(`${dateString}T00:00:00Z`));
}

function pick(list, index, salt = 0) {
  return list[(index + salt) % list.length];
}

function makeSlides(topic, pillar, dayNumber) {
  const truth = pick(truths, dayNumber, pillar.length);
  const cta = pick(ctas, dayNumber, topic.length);
  const action = pillar.includes("AI")
    ? "Context → Task → Example → Output"
    : pillar.includes("Freelancing")
      ? "Problem → Offer → Proof → Follow-up"
      : pillar.includes("Creator")
        ? "Hook → Value → Proof → CTA"
        : "Goal → System → Action → Review";

  return [
    { slide: 1, label: "Hook", text: topic },
    { slide: 2, label: "Problem", text: `Log ${pillar.toLowerCase()} ko random tareeke se karte hain.` },
    { slide: 3, label: "Truth", text: truth },
    { slide: 4, label: "Framework", text: action },
    { slide: 5, label: "7-day task", text: "Ek small output choose karo aur 7 din repeat karo." },
    { slide: 6, label: "CTA", text: cta }
  ];
}

export function buildYearContentCalendar() {
  const posts = [];

  for (let i = 0; i < DAYS; i += 1) {
    const date = addDays(START_DATE, i);
    const dayNumber = i + 1;
    const week = `Week ${Math.floor(i / 7) + 1}`;
    const monthIndex = Math.min(11, Math.floor(i / 31));
    const monthlyTheme = monthlyThemes[monthIndex];
    const pillar = pick(pillars, i, Math.floor(i / 13));
    const topics = topicsByPillar[pillar];
    const topic = pick(topics, i, monthIndex);
    const format = pick(formats, i, pillar.length);
    const hookPrefix = pick(hooks, i, topic.length);
    const hook = `${hookPrefix} ${topic.toLowerCase()}`;
    const slides = makeSlides(topic, pillar, dayNumber);
    const caption = `${topic}\n\nReality: ${slides[2].text}\n\nGrowth ka game fancy tools ka nahi, simple repeatable systems ka hai.\nEk chhota action choose karo, usko 7 din repeat karo, aur proof build karo.\n\n${pick(ctas, i, 3)}.`;
    const hashtags = hashtagMap[pillar].split(" ");
    const queueId = `daily-${date}-${slugify(topic)}`;

    posts.push({
      dayNumber,
      date,
      day: getDayName(date),
      week,
      monthlyTheme,
      pillar,
      format,
      title: `${topic} — ${dayNumber <= 90 ? "Beginner-friendly" : dayNumber <= 210 ? "Growth-focused" : "Advanced execution"}`,
      hook,
      slides,
      caption: `${caption}\n\n${hashtags.join(" ")}`,
      hashtags,
      visualPrompt: `Premium faceless 3D visual for @buildkarbro. Theme: ${topic}. Faceless ambitious Indian creator/student/freelancer character in orange hoodie, minimal white studio background, blue and orange gradient accents, polished commercial lighting, modern props related to AI/business/productivity, no text inside visual, square composition.`,
      status: "Planned",
      queueId,
      publishAt: `${date}T${DEFAULT_PUBLISH_TIME}:00+05:30`
    });
  }

  return {
    brand: {
      name: "Build Kar Bro",
      handle: "@buildkarbro",
      audience: ["Indian creators", "freelancers", "students", "entrepreneurs", "AI/business learners"],
      tone: "Relatable Hinglish, funny, ambitious, practical",
      visualSystem: "Premium faceless creator brand: orange hoodie, white minimal studio, blue/orange accents, no text inside AI visual."
    },
    schedule: {
      timezone: TIMEZONE,
      startDate: START_DATE,
      endDate: addDays(START_DATE, DAYS - 1),
      defaultPublishTime: DEFAULT_PUBLISH_TIME
    },
    checksum: crypto.createHash("sha256").update(`${START_DATE}:${DAYS}:buildkarbro`).digest("hex"),
    posts
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const calendar = buildYearContentCalendar();
  console.log(JSON.stringify(calendar, null, 2));
}
