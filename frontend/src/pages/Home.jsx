import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarClock, CloudUpload, MonitorPlay, MapPin, RefreshCw, Tv, Zap, ShieldCheck, Clapperboard } from "lucide-react";

const ICONS = [CloudUpload, CalendarClock, MapPin, RefreshCw, Clapperboard, ShieldCheck];

const T = {
  en: {
    nav: ["Features", "How it works", "Contact"], login: "Log in", book: "Book a demo",
    badge: "Digital menu boards for restaurants",
    h1a: "Your menu, on every TV.", h1b: "Updated in seconds.",
    sub: "InstaMenu turns any television into a digital menu board. Show menus, promos and food videos — and change them from your phone.",
    ctaDemo: "Request a free demo", ctaQuote: "Get a quote",
    heroAlt: "InstaMenu digital menu in a restaurant", promoAlt: "Promo video on a TV",
    featKicker: "Features", featTitle: "Everything your screens need. Nothing they don't.",
    features: [
      ["Upload once, play everywhere", "Drop in menu images and promo videos. Every TV updates automatically, no USB sticks."],
      ["Dayparting schedules", "Breakfast in the morning, lunch at noon, happy hour at 5 — your screens switch on their own."],
      ["Multiple locations", "Manage every restaurant and every TV from one dashboard, wherever you are."],
      ["Instant price changes", "Update a price or a promo and see it live on your screens in seconds."],
      ["Images & video", "Mix static menus with eye-catching food videos that make customers order more."],
      ["Works offline", "Content is stored on the player, so your menu keeps running even if the internet drops."],
    ],
    howTitle: "Up and running in under 10 minutes.",
    steps: [
      ["Plug in the player", "Connect the InstaMenu Player to any TV with HDMI."],
      ["Pair with a code", "Enter the 6-digit code shown on the TV in your dashboard."],
      ["Go live", "Pick a playlist and your digital menu is on air."],
    ],
    demoKicker: "Let's talk", demoTitle: "See InstaMenu on your own screens.",
    demoText: "Tell us about your restaurant — how many locations and TVs you have — and we'll set up a free demo and send you a custom quote.",
    perks: ["Free personalized demo", "Custom quote for your number of screens", "We help you set up your first menu"],
    formTitle: "Request a demo or quote",
    rights: "All rights reserved.", privacy: "Privacy",
  },
  es: {
    nav: ["Funciones", "Cómo funciona", "Contacto"], login: "Iniciar sesión", book: "Agenda un demo",
    badge: "Menús digitales para restaurantes",
    h1a: "Tu menú, en cada TV.", h1b: "Actualizado en segundos.",
    sub: "InstaMenu convierte cualquier televisión en un menú digital. Muestra menús, promociones y videos de tu comida — y cámbialos desde tu celular.",
    ctaDemo: "Solicita un demo gratis", ctaQuote: "Pide una cotización",
    heroAlt: "Menú digital InstaMenu en un restaurante", promoAlt: "Video promocional en una TV",
    featKicker: "Funciones", featTitle: "Todo lo que tus pantallas necesitan. Nada que sobre.",
    features: [
      ["Súbelo una vez, se ve en todas", "Sube imágenes del menú y videos promocionales. Todas las TVs se actualizan solas, sin memorias USB."],
      ["Horarios automáticos", "Desayuno en la mañana, comida al mediodía, happy hour a las 5 — tus pantallas cambian solas."],
      ["Varias sucursales", "Administra todos tus restaurantes y todas tus TVs desde un solo panel, estés donde estés."],
      ["Cambios de precio al instante", "Cambia un precio o una promoción y míralo en tus pantallas en segundos."],
      ["Imágenes y video", "Combina menús fijos con videos de comida que antojan y hacen que tus clientes pidan más."],
      ["Funciona sin internet", "El contenido se guarda en el reproductor, así tu menú sigue corriendo aunque se caiga el internet."],
    ],
    howTitle: "Funcionando en menos de 10 minutos.",
    steps: [
      ["Conecta el reproductor", "Conecta el InstaMenu Player a cualquier TV por HDMI."],
      ["Vincula con un código", "Escribe en tu panel el código de 6 dígitos que aparece en la TV."],
      ["Sal al aire", "Elige una playlist y tu menú digital ya está en pantalla."],
    ],
    demoKicker: "Hablemos", demoTitle: "Mira InstaMenu en tus propias pantallas.",
    demoText: "Cuéntanos de tu restaurante — cuántas sucursales y TVs tienes — y te preparamos un demo gratis y una cotización a tu medida.",
    perks: ["Demo personalizado gratis", "Cotización según tu número de pantallas", "Te ayudamos a montar tu primer menú"],
    formTitle: "Solicita un demo o cotización",
    rights: "Todos los derechos reservados.", privacy: "Privacidad",
  },
};

const initialLang = () => {
  const saved = localStorage.getItem("im_lang");
  if (saved === "es" || saved === "en") return saved;
  return (navigator.language || "").toLowerCase().startsWith("es") ? "es" : "en";
};

const scrollToDemo = () => document.getElementById("demo")?.scrollIntoView({ behavior: "smooth" });

const LangToggle = ({ lang, setLang }) => (
  <div className="flex rounded-full border border-zinc-200 bg-zinc-100 p-0.5 text-xs font-semibold" data-testid="lang-toggle">
    {["es", "en"].map((l) => (
      <button
        key={l}
        onClick={() => setLang(l)}
        className={`rounded-full px-3 py-1.5 uppercase transition-colors ${lang === l ? "bg-zinc-950 text-white" : "text-zinc-500 hover:text-zinc-900"}`}
        data-testid={`lang-${l}-btn`}
      >
        {l}
      </button>
    ))}
  </div>
);

const Nav = ({ t, lang, setLang }) => (
  <header className="sticky top-0 z-40 border-b border-zinc-200/70 bg-white/80 backdrop-blur-xl" data-testid="home-nav">
    <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-6 py-4">
      <a href="#top" className="flex items-center gap-3" data-testid="home-logo">
        <img src="/logo.jpg" alt="InstaMenu" className="h-9 w-9 rounded-lg object-cover" />
        <span className="font-display text-lg font-semibold tracking-tight">InstaMenu</span>
      </a>
      <nav className="hidden items-center gap-8 text-sm text-zinc-600 md:flex">
        {["features", "how", "demo"].map((id, i) => (
          <a key={id} href={`#${id}`} className="transition-colors hover:text-zinc-950" data-testid={`nav-${id}-link`}>{t.nav[i]}</a>
        ))}
      </nav>
      <div className="flex items-center gap-2 sm:gap-3">
        <LangToggle lang={lang} setLang={setLang} />
        <Link to="/login" className="hidden rounded-full px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 sm:inline-block" data-testid="nav-login-btn">{t.login}</Link>
        <button onClick={scrollToDemo} className="rounded-full bg-orange-500 px-5 py-2 text-sm font-semibold text-white transition-[background-color,transform] hover:-translate-y-0.5 hover:bg-orange-600" data-testid="nav-demo-btn">{t.book}</button>
      </div>
    </div>
  </header>
);

const Hero = ({ t }) => (
  <section id="top" className="relative overflow-hidden bg-zinc-950 text-white" data-testid="home-hero">
    <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "radial-gradient(#fff 1px, transparent 1px)", backgroundSize: "22px 22px" }} />
    <div className="relative mx-auto grid max-w-7xl gap-14 px-6 py-24 lg:grid-cols-[1.05fr_1fr] lg:py-32">
      <div className="home-rise">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-orange-300">
          <Tv className="h-3.5 w-3.5" /> {t.badge}
        </span>
        <h1 className="mt-6 font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl" data-testid="hero-title">
          {t.h1a}<br /><span className="text-orange-500">{t.h1b}</span>
        </h1>
        <p className="mt-6 max-w-xl text-base text-zinc-400 md:text-lg">{t.sub}</p>
        <div className="mt-10 flex flex-wrap gap-4">
          <button onClick={scrollToDemo} className="group inline-flex items-center gap-2 rounded-full bg-orange-500 px-7 py-3.5 font-semibold transition-[background-color,transform] hover:-translate-y-0.5 hover:bg-orange-600" data-testid="hero-demo-btn">
            {t.ctaDemo} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </button>
          <button onClick={scrollToDemo} className="rounded-full border border-white/20 px-7 py-3.5 font-semibold transition-colors hover:bg-white/10" data-testid="hero-quote-btn">{t.ctaQuote}</button>
        </div>
      </div>
      <div className="home-rise relative [animation-delay:150ms]">
        <div className="absolute -inset-6 rounded-[2rem] bg-orange-500/20 blur-3xl" />
        <div className="relative rounded-2xl bg-black p-2 shadow-2xl ring-1 ring-white/10">
          <img src="/store-assets/screenshot-1-menu-1280x720.png" alt={t.heroAlt} className="aspect-video w-full rounded-xl object-cover" data-testid="hero-image" />
        </div>
        <div className="absolute -bottom-8 -left-6 hidden w-1/2 rounded-xl bg-black p-1.5 shadow-2xl ring-1 ring-white/10 sm:block">
          <img src="/store-assets/screenshot-2-promo-1280x720.png" alt={t.promoAlt} className="aspect-video w-full rounded-lg object-cover" />
        </div>
      </div>
    </div>
  </section>
);

const Features = ({ t }) => (
  <section id="features" className="mx-auto max-w-7xl px-6 py-28" data-testid="home-features">
    <div className="max-w-2xl">
      <p className="text-sm font-semibold uppercase tracking-widest text-orange-600">{t.featKicker}</p>
      <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">{t.featTitle}</h2>
    </div>
    <div className="mt-16 grid gap-px overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-200 sm:grid-cols-2 lg:grid-cols-3">
      {t.features.map(([title, text], i) => {
        const Icon = ICONS[i];
        return (
          <div key={i} className="group bg-white p-8 transition-colors hover:bg-orange-50/40" data-testid={`feature-card-${i}`}>
            <Icon className="h-6 w-6 text-orange-500 transition-transform group-hover:-translate-y-0.5" />
            <h3 className="mt-6 font-display text-lg font-semibold tracking-tight">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600">{text}</p>
          </div>
        );
      })}
    </div>
  </section>
);

const HowItWorks = ({ t }) => (
  <section id="how" className="border-y border-zinc-200 bg-white" data-testid="home-how">
    <div className="mx-auto max-w-7xl px-6 py-28">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <h2 className="max-w-xl font-display text-3xl font-semibold tracking-tight sm:text-4xl">{t.howTitle}</h2>
        <MonitorPlay className="h-10 w-10 text-zinc-300" />
      </div>
      <div className="mt-16 grid gap-10 md:grid-cols-3">
        {t.steps.map(([title, text], i) => (
          <div key={i} className="border-t-2 border-zinc-950 pt-6" data-testid={`step-${i + 1}`}>
            <span className="font-display text-5xl font-semibold text-orange-500">0{i + 1}</span>
            <h3 className="mt-4 font-display text-xl font-semibold tracking-tight">{title}</h3>
            <p className="mt-2 text-zinc-600">{text}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

const UnitechForm = ({ lang, title }) => {
  useEffect(() => {
    const s = document.createElement("script");
    s.src = "https://ezunitech.com/embed.js";
    s.async = true;
    document.body.appendChild(s);
    return () => s.remove();
  }, [lang]);
  return (
    <div
      key={lang}
      data-unitech-form
      data-slug="uni2"
      data-type="contact"
      data-lang={lang}
      data-accent="#ea580c"
      data-title={title}
      data-font="inherit"
      data-branding="off"
      data-testid="unitech-contact-form"
    />
  );
};

const Demo = ({ t, lang }) => (
  <section id="demo" className="mx-auto max-w-7xl px-6 py-28" data-testid="home-demo">
    <div className="grid items-start gap-14 lg:grid-cols-2">
      <div>
        <p className="text-sm font-semibold uppercase tracking-widest text-orange-600">{t.demoKicker}</p>
        <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">{t.demoTitle}</h2>
        <p className="mt-6 max-w-md text-zinc-600">{t.demoText}</p>
        <ul className="mt-10 space-y-4 text-sm text-zinc-700">
          {t.perks.map((p) => (
            <li key={p} className="flex items-center gap-3"><Zap className="h-4 w-4 text-orange-500" />{p}</li>
          ))}
        </ul>
      </div>
      <div className="flex justify-center lg:justify-end"><UnitechForm lang={lang} title={t.formTitle} /></div>
    </div>
  </section>
);

const Footer = ({ t }) => (
  <footer className="bg-zinc-950 text-zinc-400" data-testid="home-footer">
    <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-10 text-sm">
      <span>© {new Date().getFullYear()} InstaMenu. {t.rights}</span>
      <div className="flex gap-6">
        <Link to="/privacy" className="hover:text-white" data-testid="footer-privacy-link">{t.privacy}</Link>
        <Link to="/login" className="hover:text-white" data-testid="footer-login-link">{t.login}</Link>
      </div>
    </div>
  </footer>
);

export default function Home() {
  const [lang, setLangState] = useState(initialLang);
  const setLang = (l) => { localStorage.setItem("im_lang", l); setLangState(l); };
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const t = T[lang];
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950" data-testid="home-page">
      <Nav t={t} lang={lang} setLang={setLang} />
      <Hero t={t} />
      <Features t={t} />
      <HowItWorks t={t} />
      <Demo t={t} lang={lang} />
      <Footer t={t} />
    </div>
  );
}
