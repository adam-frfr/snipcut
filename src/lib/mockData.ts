export interface VideoSample {
  id: string;
  title: string;
  channel: string;
  duration: string;
  sourceUrl: string;
  thumbnail: string;
  rawVideoUrl: string;
  description: string;
  speaker1: string;
  speaker2?: string;
}

export interface GeneratedClip {
  id: string;
  sampleId: string;
  title: string;
  viralityScore: number;
  hookStrength: number;
  engagementScore: number;
  trendMatch: number;
  viralityReason: string;
  duration: string;
  aspectRatio: "9:16" | "1:1" | "16:9";
  captionStyle: "hormozi" | "neon" | "beast" | "clean";
  transcript: {
    start: number;
    end: number;
    text: string;
    speaker: string;
    highlightWord?: string;
  }[];
  layout: "single-focus" | "split-screen" | "blurred-fit";
  bRollTrigger?: string;
  videoUrl: string;
  thumbnailUrl: string;
}

export const SAMPLE_VIDEOS: VideoSample[] = [
  {
    id: "sample-sam-altman",
    title: "Sam Altman: The Reality of AGI and The Next 5 Years",
    channel: "Lex Fridman Podcast #419",
    duration: "2:14:30",
    sourceUrl: "https://youtube.com/watch?v=sample-sam-altman",
    thumbnail: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80",
    rawVideoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    description: "Sam Altman speaks candidly on compute clusters, human consciousness, and what superhuman AI means for humanity.",
    speaker1: "Sam Altman",
    speaker2: "Lex Fridman",
  },
  {
    id: "sample-alex-hormozi",
    title: "The 100M Marketing Secret Nobody Talks About",
    channel: "Alex Hormozi",
    duration: "48:15",
    sourceUrl: "https://youtube.com/watch?v=sample-alex-hormozi",
    thumbnail: "https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=800&auto=format&fit=crop&q=80",
    rawVideoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
    description: "How to craft an irresistible offer that makes customers feel stupid saying no. Complete tactical breakdown.",
    speaker1: "Alex Hormozi",
  },
  {
    id: "sample-huberman",
    title: "How to Reset Your Dopamine for Supreme Motivation",
    channel: "Huberman Lab Podcast",
    duration: "1:52:00",
    sourceUrl: "https://youtube.com/watch?v=sample-huberman",
    thumbnail: "https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=800&auto=format&fit=crop&q=80",
    rawVideoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    description: "Dr. Andrew Huberman explains the neurobiology of dopamine baseline vs spikes and how to master deep focus.",
    speaker1: "Dr. Andrew Huberman",
  },
  {
    id: "sample-mrbeast",
    title: "Why 99 Percent of Videos Fail in the First 5 Seconds",
    channel: "The Joe Rogan Experience",
    duration: "2:40:12",
    sourceUrl: "https://youtube.com/watch?v=sample-mrbeast",
    thumbnail: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800&auto=format&fit=crop&q=80",
    rawVideoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
    description: "MrBeast reveals the secret science of hooks, pacing, retention graphs, and psychological packaging.",
    speaker1: "MrBeast",
    speaker2: "Joe Rogan",
  },
];

export const MOCK_CLIPS: GeneratedClip[] = [
  {
    id: "clip-1",
    sampleId: "sample-sam-altman",
    title: "AGI is not coming in 20 years, it is happening right now",
    viralityScore: 98,
    hookStrength: 99,
    engagementScore: 96,
    trendMatch: 98,
    viralityReason: "High-stakes revelation about artificial intelligence timeline with an immediate contrarian hook within first 3 seconds.",
    duration: "0:42",
    aspectRatio: "9:16",
    captionStyle: "neon",
    layout: "split-screen",
    bRollTrigger: "Futuristic supercomputer visual",
    videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    thumbnailUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80",
    transcript: [
      { start: 0, end: 3, text: "Most people think", speaker: "Sam Altman", highlightWord: "think" },
      { start: 3, end: 6, text: "AGI is decades away,", speaker: "Sam Altman", highlightWord: "AGI" },
      { start: 6, end: 11, text: "but look at the exponential compute curve.", speaker: "Sam Altman", highlightWord: "exponential" },
      { start: 11, end: 17, text: "The systems we are training today are already reasoning.", speaker: "Sam Altman", highlightWord: "reasoning" },
      { start: 17, end: 24, text: "If you wait until 2030 to adapt, your entire business will be obsolete.", speaker: "Sam Altman", highlightWord: "obsolete" },
      { start: 24, end: 32, text: "We are entering the steepest inflection point in human history.", speaker: "Sam Altman", highlightWord: "inflection point" },
    ],
  },
  {
    id: "clip-2",
    sampleId: "sample-alex-hormozi",
    title: "The Number 1 Reason Why Small Businesses Go Broke",
    viralityScore: 94,
    hookStrength: 95,
    engagementScore: 92,
    trendMatch: 95,
    viralityReason: "Strong monetary pain point paired with simple tactical advice. High audience retention rate predicted for entrepreneurs.",
    duration: "0:38",
    aspectRatio: "9:16",
    captionStyle: "hormozi",
    layout: "single-focus",
    bRollTrigger: "Stacks of cash and bankruptcy chart",
    videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
    thumbnailUrl: "https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=600&auto=format&fit=crop&q=80",
    transcript: [
      { start: 0, end: 2.5, text: "Stop competing on price.", speaker: "Alex Hormozi", highlightWord: "Stop" },
      { start: 2.5, end: 7, text: "When you are the cheapest, you attract the absolute worst customers.", speaker: "Alex Hormozi", highlightWord: "cheapest" },
      { start: 7, end: 14, text: "Instead, 10x your price and deliver a guarantee so ridiculous they cannot say no.", speaker: "Alex Hormozi", highlightWord: "10x your price" },
      { start: 14, end: 21, text: "That is how you build a hundred million dollar business overnight.", speaker: "Alex Hormozi", highlightWord: "hundred million" },
    ],
  },
  {
    id: "clip-3",
    sampleId: "sample-huberman",
    title: "Do this for 10 minutes every morning to fix your focus",
    viralityScore: 91,
    hookStrength: 93,
    engagementScore: 89,
    trendMatch: 91,
    viralityReason: "Direct actionable life-hack hook. Highly shareable on TikTok & IG Reels with strong self-improvement audience overlap.",
    duration: "0:45",
    aspectRatio: "9:16",
    captionStyle: "clean",
    layout: "single-focus",
    bRollTrigger: "Morning sunlight through trees",
    videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
    thumbnailUrl: "https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=600&auto=format&fit=crop&q=80",
    transcript: [
      { start: 0, end: 3, text: "Within 30 minutes of waking,", speaker: "Andrew Huberman", highlightWord: "waking" },
      { start: 3, end: 8, text: "get outside and view direct natural sunlight.", speaker: "Andrew Huberman", highlightWord: "sunlight" },
      { start: 8, end: 14, text: "It triggers a cortisol pulse that sets your 24-hour circadian clock.", speaker: "Andrew Huberman", highlightWord: "cortisol" },
      { start: 14, end: 22, text: "Your dopamine baseline stays elevated, and sleep at night becomes effortless.", speaker: "Andrew Huberman", highlightWord: "dopamine" },
    ],
  },
  {
    id: "clip-4",
    sampleId: "sample-mrbeast",
    title: "MrBeast Golden Rule for the First 3 Seconds",
    viralityScore: 89,
    hookStrength: 94,
    engagementScore: 88,
    trendMatch: 86,
    viralityReason: "Celebrity authority + insider behind-the-scenes algorithm secret that content creators obsessively save.",
    duration: "0:51",
    aspectRatio: "9:16",
    captionStyle: "beast",
    layout: "split-screen",
    bRollTrigger: "Rapid YouTube thumbnail montage",
    videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyBlazes.mp4",
    thumbnailUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&auto=format&fit=crop&q=80",
    transcript: [
      { start: 0, end: 3, text: "If the first frame", speaker: "MrBeast", highlightWord: "first frame" },
      { start: 3, end: 7, text: "does not match the thumbnail promise, they swipe.", speaker: "MrBeast", highlightWord: "swipe" },
      { start: 7, end: 13, text: "Never say Hey guys welcome back. Say the craziest sentence first.", speaker: "MrBeast", highlightWord: "craziest" },
      { start: 13, end: 21, text: "Hook them by second two, or your video is dead on arrival.", speaker: "MrBeast", highlightWord: "dead on arrival" },
    ],
  },
];

export const CAPTION_PRESETS = [
  {
    id: "hormozi",
    name: "Alex Hormozi",
    desc: "Bold punchy yellow and green text, black stroke, all caps",
    textColor: "#FACC15",
    highlightColor: "#22C55E",
    bgStyle: "black-stroke",
    uppercase: true,
  },
  {
    id: "neon",
    name: "Cyberpunk Neon",
    desc: "Violet and cyan text with high contrast outline",
    textColor: "#FFFFFF",
    highlightColor: "#06B6D4",
    bgStyle: "neon-glow",
    uppercase: false,
  },
  {
    id: "beast",
    name: "MrBeast Punch",
    desc: "Maximum contrast, giant font, high retention pop",
    textColor: "#FFFFFF",
    highlightColor: "#EF4444",
    bgStyle: "shadow-heavy",
    uppercase: true,
  },
  {
    id: "clean",
    name: "Subtle Modern",
    desc: "Clean minimal subtitles with soft pill backdrop",
    textColor: "#FFFFFF",
    highlightColor: "#000000",
    bgStyle: "pill-backdrop",
    uppercase: false,
  },
];
