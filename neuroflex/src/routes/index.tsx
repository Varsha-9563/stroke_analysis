import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, ArrowRight, Bluetooth, BrainCircuit, ChartNoAxesCombined, Check, Hand, HeartPulse, Stethoscope, UserRound } from "lucide-react";
import gloveImage from "@/assets/neuroflex-glove.jpg";
import { Brand } from "@/components/ui";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "NeuroFlex — Smart Hand Rehabilitation" },
    { name: "description", content: "AI-assisted hand movement analysis and rehabilitation progress for doctors and patients." },
    { property: "og:title", content: "NeuroFlex — Smarter Hand Rehabilitation" },
    { property: "og:description", content: "Turn smart-glove movement data into meaningful recovery insights." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ]}),
  component: LandingPage,
});

const steps = [
  ["01", "Capture", "Five flex sensors capture finger movement.", Hand],
  ["02", "Connect", "The smart glove sends readings wirelessly.", Bluetooth],
  ["03", "Analyze", "Services process movement data with AI assistance.", BrainCircuit],
  ["04", "Understand", "Doctors review trends and finger performance.", ChartNoAxesCombined],
  ["05", "Rehabilitate", "Exercises are assigned and tracked each day.", HeartPulse],
] as const;
const demoFingers = [["Thumb", 42, 68], ["Index", 36, 61], ["Middle", 29, 56], ["Ring", 24, 49], ["Little", 19, 41]] as const;

function LandingPage() {
  return <div className="landing-page">
    <header className="public-nav"><Link to="/" aria-label="NeuroFlex home"><Brand /></Link><nav><a href="#platform">Platform</a><a href="#experiences">Experiences</a><Link to="/login" search={{ role: "doctor" }} className="text-link">Doctor login</Link><Link to="/login" search={{ role: "patient" }} className="nav-cta">Patient login</Link></nav></header>
    <main>
      <section className="hero-section">
        <div className="hero-copy"><span className="eyebrow">AI-assisted movement analysis</span><h1>Smarter Hand Rehabilitation.<br/><span>Measurable Recovery.</span></h1><p>Monitor finger movement, understand recovery progress, and help doctors make informed rehabilitation decisions through intelligent hand-movement analysis.</p><div className="hero-actions"><a href="#platform" className="button button-primary">Explore platform <ArrowRight size={17} /></a><Link to="/login" search={{ role: "doctor" }} className="button button-secondary">Doctor login</Link><Link to="/login" search={{ role: "patient" }} className="button button-ghost">Patient login</Link></div><p className="decision-note"><Check size={15} /> Decision support for rehabilitation teams — not a diagnostic tool.</p></div>
        <div className="hero-visual"><img src={gloveImage} width={1200} height={1008} alt="Smart rehabilitation glove with five finger sensors"/><div className="sensor-card"><span>Sensor matrix</span><strong>5-channel</strong><small>Finger movement capture</small></div><div className="signal-pill"><i /> Glove connection ready</div></div>
      </section>

      <section id="platform" className="process-section"><div className="section-heading"><span className="eyebrow">From movement to insight</span><h2>A connected recovery workflow</h2><p>Every glove session becomes clear, reviewable information for the people guiding recovery.</p></div><div className="process-grid">{steps.map(([n,title,copy,Icon]) => <article key={n} className="process-step"><div className="step-top"><span>{n}</span><Icon size={20}/></div><h3>{title}</h3><p>{copy}</p></article>)}</div></section>

      <section className="analysis-band"><div className="analysis-copy"><span className="eyebrow eyebrow-light">Explanatory visualization</span><h2>See movement change finger by finger.</h2><p>Compare a recorded baseline with current movement to make progress easier to understand. Values shown here demonstrate the interface only.</p><div className="analysis-legend"><span><i className="before"/>Before rehabilitation</span><span><i className="current"/>Current progress</span></div></div><div className="comparison-panel"><div className="demo-label">DEMO DATA — NOT A PATIENT RESULT</div>{demoFingers.map(([name,before,current]) => <div className="finger-row" key={name}><span>{name}</span><div className="bar-pair"><i className="bar-before" style={{width:`${before}%`}}/><i className="bar-current" style={{width:`${current}%`}}/></div><strong>{current}%</strong></div>)}</div></section>

      <section id="experiences" className="experience-section"><div className="section-heading"><span className="eyebrow">Designed for connected care</span><h2>One platform. Two focused experiences.</h2></div><div className="experience-grid"><article><span className="experience-icon"><Stethoscope/></span><p className="overline">For doctors</p><h3>Clinical clarity without clutter</h3><ul>{["Patient management and recovery trends","Finger-wise movement analysis","Exercise recommendations and adherence","Recovery and discharge status"].map(x=><li key={x}><Check/>{x}</li>)}</ul><Link to="/login" search={{role:"doctor"}}>Enter doctor portal <ArrowRight/></Link></article><article className="patient-experience"><span className="experience-icon"><UserRound/></span><p className="overline">For patients</p><h3>A recovery journey that feels personal</h3><ul>{["Assigned exercises and daily tracking","Progress, streaks, and milestones","Clear recovery trend visualization","Updates from the care team"].map(x=><li key={x}><Check/>{x}</li>)}</ul><Link to="/login" search={{role:"patient"}}>Enter patient portal <ArrowRight/></Link></article></div></section>

      <section className="final-cta"><Activity/><h2>Turn movement data into meaningful recovery insights.</h2><p>Support each rehabilitation decision with clear, trackable hand-movement analysis.</p><div><Link to="/login" search={{role:"doctor"}} className="button button-light">Doctor login</Link><Link to="/login" search={{role:"patient"}} className="button button-outline-light">Patient login</Link></div></section>
    </main>
    <footer className="public-footer"><Brand/><p>AI-assisted rehabilitation decision support. No diagnosis intended.</p><span>© 2026 NeuroFlex</span></footer>
  </div>;
}
