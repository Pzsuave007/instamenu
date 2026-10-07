import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarClock, CloudUpload, MonitorPlay, MapPin, RefreshCw, Tv, Zap, ShieldCheck, Clapperboard } from "lucide-react";

const FEATURES = [
  { icon: CloudUpload, title: "Upload once, play everywhere", text: "Drop in menu images and promo videos. Every TV updates automatically, no USB sticks." },
  { icon: CalendarClock, title: "Dayparting schedules", text: "Breakfast in the morning, lunch at noon, happy hour at 5 — your screens switch on their own." },
  { icon: MapPin, title: "Multiple locations", text: "Manage every restaurant and every TV from one dashboard, wherever you are." },
  { icon: RefreshCw, title: "Instant price changes", text: "Update a price or a promo and see it live on your screens in seconds." },
  { icon: Clapperboard, title: "Images & video", text: "Mix static menus with eye-catching food videos that make customers order more." },
  { icon: ShieldCheck, title: "Works offline", text: "Content is stored on the player, so your menu keeps running even if the internet drops." },
];

const STEPS = [
  { n: "01", title: "Plug in the player", text: "Connect the InstaMenu Player to any TV with HDMI." },
  { n: "02", title: "Pair with a code", text: "Enter the 6-digit code shown on the TV in your dashboard." },
  { n: "03", title: "Go live", text: "Pick a playlist and your digital menu is on air." },
];

const scrollToDemo = () => document.getElementById("demo")?.scrollIntoView({ behavior: "smooth" });

const Nav = () => (
  <header className="sticky top-0 z-40 border-b border-zinc-200/70 bg-white/80 backdrop-blur-xl" data-testid="home-nav">
    <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
      <a href="#top" className="flex items-center gap-3" data-testid="home-logo">
        <img src="/logo.jpg" alt="InstaMenu" className="h-9 w-9 rounded-lg object-cover" />
        <span className="font-display text-lg font-semibold tracking-tight">InstaMenu</span>
      </a>
      <nav className="hidden items-center gap-8 text-sm text-zinc-600 md:flex">
        <a href="#features" className="transition-colors hover:text-zinc-950" data-testid="nav-features-link">Features</a>
        <a href="#how" className="transition-colors hover:text-zinc-950" data-testid="nav-how-link">How it works</a>
        <a href="#demo" className="transition-colors hover:text-zinc-950" data-testid="nav-demo-link">Contact</a>
      </nav>
      <div className="flex items-center gap-3">
        <Link to="/login" className="rounded-full px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100" data-testid="nav-login-btn">Log in</Link>
        <button onClick={scrollToDemo} className="rounded-full bg-orange-500 px-5 py-2 text-sm font-semibold text-white transition-[background-color,transform] hover:-translate-y-0.5 hover:bg-orange-600" data-testid="nav-demo-btn">Book a demo</button>
      </div>
    </div>
  </header>
);

const Hero = () => (
  <section id="top" className="relative overflow-hidden bg-zinc-950 text-white" data-testid="home-hero">
    <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "radial-gradient(#fff 1px, transparent 1px)", backgroundSize: "22px 22px" }} />
    <div className="relative mx-auto grid max-w-7xl gap-14 px-6 py-24 lg:grid-cols-[1.05fr_1fr] lg:py-32">
      <div className="home-rise">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-orange-300">
          <Tv className="h-3.5 w-3.5" /> Digital menu boards for restaurants
        </span>
        <h1 className="mt-6 font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
          Your menu, on every TV.<br /><span className="text-orange-500">Updated in seconds.</span>
        </h1>
        <p className="mt-6 max-w-xl text-base text-zinc-400 md:text-lg">
          InstaMenu turns any television into a digital menu board. Show menus, promos and food videos — and change them from your phone.
        </p>
        <div className="mt-10 flex flex-wrap gap-4">
          <button onClick={scrollToDemo} className="group inline-flex items-center gap-2 rounded-full bg-orange-500 px-7 py-3.5 font-semibold transition-[background-color,transform] hover:-translate-y-0.5 hover:bg-orange-600" data-testid="hero-demo-btn">
            Request a free demo <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </button>
          <button onClick={scrollToDemo} className="rounded-full border border-white/20 px-7 py-3.5 font-semibold transition-colors hover:bg-white/10" data-testid="hero-quote-btn">
            Get a quote
          </button>
        </div>
      </div>
      <div className="home-rise relative [animation-delay:150ms]">
        <div className="absolute -inset-6 rounded-[2rem] bg-orange-500/20 blur-3xl" />
        <div className="relative rounded-2xl bg-black p-2 shadow-2xl ring-1 ring-white/10">
          <img src="/store-assets/screenshot-1-menu-1280x720.png" alt="InstaMenu digital menu in a restaurant" className="aspect-video w-full rounded-xl object-cover" data-testid="hero-image" />
        </div>
        <div className="absolute -bottom-8 -left-6 hidden w-1/2 rounded-xl bg-black p-1.5 shadow-2xl ring-1 ring-white/10 sm:block">
          <img src="/store-assets/screenshot-2-promo-1280x720.png" alt="Promo video on a TV" className="aspect-video w-full rounded-lg object-cover" />
        </div>
      </div>
    </div>
  </section>
);

const Features = () => (
  <section id="features" className="mx-auto max-w-7xl px-6 py-28" data-testid="home-features">
    <div className="max-w-2xl">
      <p className="text-sm font-semibold uppercase tracking-widest text-orange-600">Features</p>
      <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Everything your screens need. Nothing they don't.</h2>
    </div>
    <div className="mt-16 grid gap-px overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-200 sm:grid-cols-2 lg:grid-cols-3">
      {FEATURES.map(({ icon: Icon, title, text }, i) => (
        <div key={title} className="group bg-white p-8 transition-colors hover:bg-orange-50/40" data-testid={`feature-card-${i}`}>
          <Icon className="h-6 w-6 text-orange-500 transition-transform group-hover:-translate-y-0.5" />
          <h3 className="mt-6 font-display text-lg font-semibold tracking-tight">{title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600">{text}</p>
        </div>
      ))}
    </div>
  </section>
);

const HowItWorks = () => (
  <section id="how" className="border-y border-zinc-200 bg-white" data-testid="home-how">
    <div className="mx-auto max-w-7xl px-6 py-28">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <h2 className="max-w-xl font-display text-3xl font-semibold tracking-tight sm:text-4xl">Up and running in under 10 minutes.</h2>
        <MonitorPlay className="h-10 w-10 text-zinc-300" />
      </div>
      <div className="mt-16 grid gap-10 md:grid-cols-3">
        {STEPS.map((s) => (
          <div key={s.n} className="border-t-2 border-zinc-950 pt-6" data-testid={`step-${s.n}`}>
            <span className="font-display text-5xl font-semibold text-orange-500">{s.n}</span>
            <h3 className="mt-4 font-display text-xl font-semibold tracking-tight">{s.title}</h3>
            <p className="mt-2 text-zinc-600">{s.text}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

const UnitechForm = () => {
  useEffect(() => {
    const s = document.createElement("script");
    s.src = "https://ezunitech.com/embed.js";
    s.async = true;
    document.body.appendChild(s);
    return () => s.remove();
  }, []);
  return (
    <div
      data-unitech-form
      data-slug="uni2"
      data-type="contact"
      data-lang="en"
      data-accent="#ea580c"
      data-title="Request a demo or quote"
      data-font="inherit"
      data-branding="off"
      data-testid="unitech-contact-form"
    />
  );
};

const Demo = () => (
  <section id="demo" className="mx-auto max-w-7xl px-6 py-28" data-testid="home-demo">
    <div className="grid items-start gap-14 lg:grid-cols-2">
      <div>
        <p className="text-sm font-semibold uppercase tracking-widest text-orange-600">Let's talk</p>
        <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">See InstaMenu on your own screens.</h2>
        <p className="mt-6 max-w-md text-zinc-600">
          Tell us about your restaurant — how many locations and TVs you have — and we'll set up a free demo and send you a custom quote.
        </p>
        <ul className="mt-10 space-y-4 text-sm text-zinc-700">
          {["Free personalized demo", "Custom quote for your number of screens", "We help you set up your first menu"].map((t) => (
            <li key={t} className="flex items-center gap-3"><Zap className="h-4 w-4 text-orange-500" />{t}</li>
          ))}
        </ul>
      </div>
      <div className="flex justify-center lg:justify-end"><UnitechForm /></div>
    </div>
  </section>
);

const Footer = () => (
  <footer className="bg-zinc-950 text-zinc-400" data-testid="home-footer">
    <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-10 text-sm">
      <span>© {new Date().getFullYear()} InstaMenu. All rights reserved.</span>
      <div className="flex gap-6">
        <Link to="/privacy" className="hover:text-white" data-testid="footer-privacy-link">Privacy</Link>
        <Link to="/login" className="hover:text-white" data-testid="footer-login-link">Log in</Link>
      </div>
    </div>
  </footer>
);

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950" data-testid="home-page">
      <Nav />
      <Hero />
      <Features />
      <HowItWorks />
      <Demo />
      <Footer />
    </div>
  );
}
