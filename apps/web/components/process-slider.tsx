"use client";

import { useEffect, useState } from "react";

const STEPS = [
  {
    step: "STEP 01",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" />
      </svg>
    ),
    title: "Register with Copinex",
    body: "Create your Copinex profile through the verified official domain and complete the onboarding steps.",
    note: "Registration is not a trading deposit or a promise of eligibility.",
  },
  {
    step: "STEP 02",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M7 9h5M7 13h3M16 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
      </svg>
    ),
    title: "Open your broker account",
    body: "Open an account directly with an approved broker and complete the broker's identity checks.",
    note: "The broker account must be in your own name where required.",
  },
  {
    step: "STEP 03",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 6h18v12H3zM3 10h18M7 15h3" />
      </svg>
    ),
    title: "Fund the broker directly",
    body: "Fund your personal broker account subject to current broker requirements and your own risk budget.",
    note: "Do not send trading capital to Copinex or an individual representative.",
  },
  {
    step: "STEP 04",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 19V9M10 19V5M16 19v-7M22 19V3" />
      </svg>
    ),
    title: "Monitor and stay in control",
    body: "Monitor copied activity and use verified controls to pause, resume, disconnect, or withdraw.",
    note: "The approved agreement must explain what happens to open positions.",
  },
];

/** How-it-works slideshow — arrows, dots, keyboard, autoplay. */
export function ProcessSlider() {
  const [index, setIndex] = useState(0);
  const total = STEPS.length;

  useEffect(() => {
    const timer = setInterval(() => setIndex((i) => (i + 1) % total), 7000);
    return () => clearInterval(timer);
  }, [total]);

  function go(delta: number) {
    setIndex((i) => (i + delta + total) % total);
  }

  return (
    <div
      className="slider-shell"
      role="group"
      aria-roledescription="slideshow"
      aria-label="How Copinex works"
    >
      <div className="slider-viewport" aria-live="polite">
        {STEPS.map((step, i) => (
          <article
            key={step.step}
            className={`process-slide ${i === index ? "is-active" : ""}`}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${total}`}
            aria-hidden={i !== index}
          >
            <div className="slide-number">
              <span>{step.step}</span>
              <span className="slide-icon">{step.icon}</span>
            </div>
            <div className="slide-body">
              <h3>{step.title}</h3>
              <p>{step.body}</p>
              <div className="slide-safety">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
                {step.note}
              </div>
            </div>
          </article>
        ))}
      </div>
      <div className="slider-controls">
        <div className="slider-dots" role="tablist" aria-label="Choose process slide">
          {STEPS.map((step, i) => (
            <button
              key={step.step}
              className={`slider-dot ${i === index ? "active" : ""}`}
              type="button"
              role="tab"
              aria-label={`Show step ${i + 1}`}
              aria-selected={i === index}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
        <span className="slide-status" aria-live="polite">
          {index + 1} / {total}
        </span>
        <div className="slider-buttons">
          <button className="slider-button previous" type="button" aria-label="Previous slide" onClick={() => go(-1)}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <button className="slider-button next" type="button" aria-label="Next slide" onClick={() => go(1)}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}