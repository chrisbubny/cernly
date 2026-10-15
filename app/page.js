'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

const CSS = `
:root {
  --ink: #11131d;
  --muted: #6f7280;
  --line: #e9eaf0;
  --violet: #7548f8;
  --blue: #3389ff;
  --cyan: #41c9eb;
  --green: #1cb985;
  --paper: #fff;
  --soft: #f7f8fc;
  --radius: 22px
}
* { box-sizing: border-box }
html { scroll-behavior: smooth }
body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: 'DM Sans', sans-serif;
  -webkit-font-smoothing: antialiased
}
button, input { font: inherit }
a { text-decoration: none; color: inherit }
button { cursor: pointer }
.wrap { width: min(1180px, calc(100% - 64px)); margin: auto }
.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  color: #6253d6;
  font-weight: 800;
  font-size: 11px;
  letter-spacing: .16em;
  text-transform: uppercase
}
.eyebrow:before {
  content: '';
  width: 7px;
  height: 7px;
  background: linear-gradient(135deg, var(--violet), var(--cyan));
  transform: rotate(45deg)
}
h1, h2, h3, p { margin-top: 0 }
h1, h2, h3 {
  font-family: Manrope, sans-serif;
  letter-spacing: -.055em
}
h1 {
  font-size: clamp(48px, 5.5vw, 78px);
  line-height: 1.08;
  font-weight: 800;
  margin: 22px 0
}
h2 {
  font-size: clamp(36px, 4vw, 56px);
  line-height: 1.13;
  font-weight: 800;
  margin: 16px 0
}
h3 { font-size: 21px; line-height: 1.25 }
p { line-height: 1.7 }
.gradient-text {
  background: linear-gradient(100deg, #7548f8 10%, #3b82f6 75%, #21bcd6);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent
}
.btn {
  display: inline-flex;
  justify-content: center;
  align-items: center;
  gap: 9px;
  padding: 14px 22px;
  border-radius: 11px;
  border: 0;
  font-size: 13px;
  font-weight: 800;
  transition: transform .2s, box-shadow .2s
}
.btn:hover { transform: translateY(-2px) }
.btn-dark { background: #11131d; color: white }
.btn-gradient {
  background: linear-gradient(110deg, #8a46f8, #446af6 60%, #258de9);
  color: white;
  box-shadow: 0 8px 22px #6a58ec36
}
.btn-light {
  background: white;
  border: 1px solid #e5e6ef;
  color: var(--ink)
}
.icon {
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  flex: none
}
.icon.sm { width: 15px; height: 15px }
.icon.lg { width: 27px; height: 27px }
.topbar {
  position: sticky;
  top: 0;
  z-index: 50;
  background: #ffffffed;
  backdrop-filter: blur(18px);
  border-bottom: 1px solid #f0f0f4
}
.nav {
  height: 76px;
  display: flex;
  align-items: center;
  gap: 48px
}
.brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font: 800 22px Manrope, sans-serif;
  letter-spacing: -.07em
}
.brand svg { width: 25px; height: 25px }
.brand span { font-weight: 600 }
.navlinks {
  display: flex;
  gap: 32px;
  font-size: 13px;
  font-weight: 700;
  color: #5e6270
}
.navlinks a:hover { color: var(--violet) }
.navright {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 20px;
  font-size: 13px;
  font-weight: 700
}
.hero {
  position: relative;
  overflow: hidden;
  padding: 105px 0
}
.hero:before {
  content: '';
  position: absolute;
  pointer-events: none;
  right: -200px;
  top: -130px;
  width: 800px;
  height: 720px;
  background: radial-gradient(ellipse at 40% 45%, #e7dfff 0, transparent 55%), radial-gradient(ellipse at 70% 50%, #e3f3ff 0, transparent 60%);
  opacity: .72
}
.hero-grid {
  display: grid;
  grid-template-columns: 1fr 1.07fr;
  align-items: center;
  gap: 74px;
  position: relative
}
.hero-copy > p { max-width: 520px; color: #666b7b; font-size: 17px }
.urlform {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid #e5e6ed;
  background: #fff;
  border-radius: 14px;
  padding: 7px;
  box-shadow: 0 10px 40px #181a2b0d;
  margin-top: 30px;
  max-width: 520px
}
.urlform .icon { margin-left: 12px; color: #8c91a0 }
.urlform input {
  border: 0;
  outline: 0;
  min-width: 0;
  flex: 1;
  padding: 12px 2px;
  font-size: 14px
}
.urlform button { white-space: nowrap }
.hero-visual { position: relative }
.glow {
  position: absolute;
  inset: 0;
  background: linear-gradient(120deg, #9e71fa, #60c5fb);
  filter: blur(72px);
  opacity: .18;
  transform: scale(.92)
}
.window {
  position: relative;
  background: #fff;
  border: 1px solid #e9e9f0;
  border-radius: 19px;
  box-shadow: 0 30px 90px #26233b1d, 0 3px 15px #27233b0c;
  overflow: hidden
}
.windowbar {
  height: 51px;
  background: #fcfcff;
  border-bottom: 1px solid #ececf1;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0 20px
}
.dot { width: 8px; height: 8px; border-radius: 50%; background: #ff6d75 }
.dot:nth-child(2) { background: #ffcb65 }
.dot:nth-child(3) { background: #50cf9b }
.windowurl { margin: auto; color: #a2a4b0; font-size: 10px }
.dashboard { padding: 23px }
.dash-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px
}
.dash-head strong { font: 800 16px Manrope, sans-serif }
.dash-head small { color: #9295a3; font-size: 10px }
.pill {
  font-size: 10px;
  padding: 6px 10px;
  background: #f1edff;
  color: #7250dd;
  border-radius: 20px;
  font-weight: 800
}
.scores {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px
}
.score {
  padding: 15px 4px;
  text-align: center;
  background: #fafaff;
  border: 1px solid #f0f0f7;
  border-radius: 12px
}
.ring {
  width: 61px;
  height: 61px;
  margin: 0 auto 10px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: conic-gradient(var(--c) calc(var(--n)*1%), #eceef5 0)
}
.ring:before {
  content: '';
  grid-area: 1/1;
  width: 48px;
  height: 48px;
  background: #fafaff;
  border-radius: 50%
}
.ring b { grid-area: 1/1; z-index: 1; font: 800 18px Manrope; color: var(--c) }
.score small { font-size: 10px; color: #777b8a; font-weight: 700 }
.summary {
  background: linear-gradient(110deg, #f7f3ff, #f0f7ff);
  border: 1px solid #eae5ff;
  border-radius: 12px;
  padding: 17px;
  margin-top: 17px
}
.summary strong { display: flex; align-items: center; gap: 7px; font-size: 12px }
.summary strong .icon { color: var(--violet) }
.summary p { font-size: 12px; line-height: 1.6; color: #656b7d; margin: 8px 0 0 }
.issue-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  margin: 18px 0 9px
}
.issue-title span { color: #858b9a; font-size: 10px }
.issue {
  display: flex;
  align-items: center;
  gap: 9px;
  border-top: 1px solid #eff0f4;
  padding: 11px 0;
  font-size: 11px
}
.issue .num {
  display: grid;
  place-items: center;
  width: 21px;
  height: 21px;
  border-radius: 7px;
  background: #edeaff;
  color: #6948dc;
  font-weight: 800;
  font-size: 10px
}
.issue .label { flex: 1 }
.severity {
  padding: 4px 7px;
  border-radius: 6px;
  background: #fff0e7;
  color: #c87535;
  font-size: 9px;
  font-weight: 800
}
.severity.low { background: #eaf8f2; color: #19946a }
.section { padding: 110px 0 }
.intro { max-width: 650px }
.intro p { color: var(--muted); font-size: 16px }
.dark-band { background: #10121b; color: white; padding: 80px 0; overflow: hidden }
.value-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 100px;
  align-items: center
}
.value-grid p { color: #a5a9ba; max-width: 480px }
.value-items { display: grid; grid-template-columns: 1fr 1fr; gap: 17px }
.value-item {
  border: 1px solid #303342;
  border-radius: 16px;
  padding: 23px;
  background: #ffffff05
}
.value-item .icon { color: #a991ff; margin-bottom: 13px }
.value-item strong { display: block; font: 800 15px Manrope }
.value-item small { display: block; color: #a4a7b5; font-size: 12px; line-height: 1.6; margin-top: 7px }
.features { background: #fff }
.feature-layout {
  display: grid;
  grid-template-columns: 270px 1fr;
  gap: 70px;
  margin-top: 60px;
  align-items: start
}
.feature-nav {
  position: sticky;
  top: 115px;
  display: flex;
  flex-direction: column;
  gap: 0
}
.feature-tab {
  border: 0;
  background: transparent;
  text-align: left;
  padding: 16px 18px;
  display: flex;
  align-items: center;
  gap: 13px;
  color: #858999;
  border-left: 2px solid #e7e7ee;
  border-radius: 0 10px 10px 0;
  font-size: 14px;
  font-weight: 700;
  transition: background-color .18s ease, color .18s ease, border-color .18s ease
}
.feature-tab.active { border-color: var(--violet); color: #6845db }
.feature-tab:hover { color: #6845db; background: #f6f3ff }
.feature-stack { display: flex; flex-direction: column; gap: 100px }
.feature-panel { scroll-margin-top: 120px; min-height: 480px }
.feature-panel h3 { font-size: 31px; margin-bottom: 12px }
.feature-panel > p { color: var(--muted); max-width: 570px; font-size: 15px }
.feature-art {
  border: 1px solid #e9eaf3;
  border-radius: 20px;
  background: linear-gradient(145deg, #fafaff, #f4f7ff);
  padding: 28px;
  margin-top: 27px;
  box-shadow: 0 16px 40px #27254a08;
  min-height: 300px
}
.art-window {
  background: white;
  border: 1px solid #ececf4;
  border-radius: 13px;
  padding: 22px;
  box-shadow: 0 12px 26px #20233b0a
}
.art-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  font-weight: 800;
  margin-bottom: 20px
}
.art-heading span { color: #858998; font-size: 11px; font-weight: 500 }
.chart { width: 100%; height: 155px }
.art-foot {
  display: flex;
  gap: 15px;
  flex-wrap: wrap;
  margin-top: 14px;
  font-size: 11px;
  color: #777c89
}
.art-foot b { color: #252a3b }
.audit-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid #f0f0f5;
  font-size: 12px
}
.audit-row:last-child { border-bottom: 0 }
.audit-row .icon { width: 16px; height: 16px; color: var(--green) }
.audit-row.warn .icon { color: #e8a147 }
.audit-row.bad .icon { color: #ee6b76 }
.audit-row span { flex: 1 }
.audit-row small { font-size: 10px; color: #999dac }
.priority {
  display: grid;
  grid-template-columns: 28px 1fr auto;
  align-items: start;
  gap: 12px;
  padding: 14px 0;
  border-bottom: 1px solid #f0f0f5
}
.priority:last-child { border: 0 }
.priority .n {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  background: #f0ebff;
  color: #704bdc;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 800
}
.priority b { font-size: 12px }
.priority p { font-size: 11px; color: #8b8e9c; margin: 4px 0 0 }
.priority em {
  font-style: normal;
  font-size: 10px;
  color: #7855df;
  background: #f2eeff;
  padding: 5px 8px;
  border-radius: 6px
}
.pathways { background: #f8f9fc }
.pathway-grid {
  display: grid;
  grid-template-columns: .9fr 1fr 1fr;
  gap: 20px;
  align-items: stretch
}
.pathway-intro { padding-right: 30px }
.pathway-intro p { color: var(--muted); font-size: 15px }
.path-card {
  background: #fff;
  border: 1px solid #e8eaf1;
  border-radius: 20px;
  padding: 29px;
  box-shadow: 0 15px 40px #1b1d3208;
  display: flex;
  flex-direction: column;
  align-items: flex-start
}
.icon-tile {
  width: 58px;
  height: 58px;
  display: grid;
  place-items: center;
  border-radius: 17px;
  background: linear-gradient(130deg, #824cf8, #3b89fb);
  color: white;
  margin-bottom: 25px;
  box-shadow: 0 9px 23px #6755e92b
}
.icon-tile.wp { background: #eef4fc; color: #21759b; box-shadow: none }
.path-card h3 { margin: 0 0 9px }
.path-card p { color: var(--muted); font-size: 13px; margin-bottom: 22px }
.path-card .btn { margin-top: auto; width: 100% }
.ticks {
  padding: 0;
  list-style: none;
  margin: 18px 0 26px;
  display: grid;
  gap: 10px;
  color: #777c89;
  font-size: 12px
}
.ticks li { display: flex; align-items: center; gap: 8px }
.ticks .icon { width: 15px; height: 15px; color: #20b586 }
.how-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 18px;
  margin-top: 45px
}
.how-card { padding: 28px; border: 1px solid var(--line); border-radius: 16px }
.how-card .number { font: 800 13px Manrope; color: #8c6af1 }
.how-card h3 { margin: 20px 0 8px; font-size: 19px }
.how-card p { font-size: 13px; color: var(--muted); margin: 0 }
.pricing { background: #fafaff }
.price-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 18px;
  margin-top: 42px
}
.plan {
  border: 1px solid #e8e8ef;
  background: white;
  border-radius: 20px;
  padding: 30px;
  display: flex;
  flex-direction: column
}
.plan.featured { background: #141622; color: white; border-color: #141622; box-shadow: 0 18px 40px #191c2a1c }
.plan .tag { font-size: 10px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: #7d60e8 }
.plan.featured .tag { color: #b8a4ff }
.price { font: 800 43px Manrope; letter-spacing: -.07em; margin: 12px 0 0 }
.price small { font-size: 13px; letter-spacing: 0; font-weight: 500; color: #999dab }
.plan > p { color: #868a99; font-size: 13px; min-height: 44px }
.plan ul {
  padding: 20px 0 24px;
  margin: 10px 0 0;
  list-style: none;
  border-top: 1px solid #ececf1;
  display: grid;
  gap: 13px;
  font-size: 12px;
  color: #626775;
  flex: 1
}
.plan.featured ul { border-color: #303340; color: #d1d3de }
.plan li { display: flex; align-items: center; gap: 10px }
.plan li .icon { color: #27b98c; width: 15px; height: 15px }
.plan .btn { width: 100% }
.closing {
  background: #10121b;
  color: white;
  text-align: center;
  padding: 90px 0;
  position: relative;
  overflow: hidden
}
.closing:before, .closing:after {
  content: '';
  position: absolute;
  width: 340px;
  height: 340px;
  border-radius: 50%;
  filter: blur(95px);
  opacity: .35;
  pointer-events: none
}
.closing:before { left: -130px; bottom: -200px; background: #8053ff }
.closing:after { right: -150px; top: -190px; background: #34b6ff }
.closing h2 { max-width: 700px; margin: 18px auto }
.closing p { color: #a9acb8; margin-bottom: 30px }
.closing .wrap { position: relative; z-index: 1 }
footer { padding: 32px 0; border-top: 1px solid #eee }
.footer-inner { display: flex; justify-content: space-between; align-items: center; gap: 25px }
.footer-inner small { color: #a0a3ae }
.footerlinks { display: flex; gap: 22px; color: #8c909d; font-size: 12px }
.toast {
  position: fixed;
  bottom: 22px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 90;
  padding: 12px 20px;
  border-radius: 12px;
  background: #151727;
  color: white;
  font-size: 13px;
  box-shadow: 0 10px 30px #0003;
  opacity: 0;
  pointer-events: none;
  transition: opacity .25s;
  max-width: calc(100% - 30px);
  text-align: center
}
.toast.show { opacity: 1; pointer-events: auto }
@media(max-width:1000px) {
  .hero-grid { gap: 35px }
  .feature-layout { grid-template-columns: 200px 1fr; gap: 35px }
  .pathway-grid { grid-template-columns: 1fr 1fr }
  .pathway-intro { grid-column: 1/-1 }
  .value-grid { gap: 45px }
}
@media(max-width:760px) {
  .wrap { width: min(100% - 36px, 1180px) }
  .nav { height: 66px; gap: 20px }
  .navlinks { display: none }
  .navright { gap: 10px }
  .navright > a:first-child { display: none }
  .hero { padding: 65px 0 }
  .hero-grid, .value-grid, .feature-layout { grid-template-columns: 1fr }
  .hero-visual { max-width: 560px; margin: 20px auto 0; width: 100% }
  .hero-copy > p { font-size: 16px }
  .section { padding: 75px 0 }
  .dark-band { padding: 65px 0 }
  .value-items { grid-template-columns: 1fr 1fr }
  .feature-nav {
    position: sticky;
    top: 66px;
    z-index: 5;
    background: #fffffff5;
    flex-direction: row;
    overflow: auto;
    gap: 0;
    border-bottom: 1px solid var(--line);
    padding: 8px 0
  }
  .feature-tab {
    white-space: nowrap;
    border-left: 0;
    border-bottom: 2px solid transparent;
    padding: 12px;
    font-size: 12px
  }
  .feature-tab.active { border-color: var(--violet); border-radius: 0 }
  .feature-stack { gap: 75px }
  .feature-panel { min-height: 0; scroll-margin-top: 155px }
  .pathway-grid, .price-grid { grid-template-columns: 1fr }
  .pathway-intro { grid-column: auto }
  .how-grid { grid-template-columns: 1fr }
  .footer-inner { flex-wrap: wrap }
}
@media(max-width:450px) {
  h1 { font-size: 45px }
  .scores { gap: 5px }
  .dashboard { padding: 14px }
  .score { padding: 12px 2px }
  .ring { width: 51px; height: 51px }
  .ring:before { width: 40px; height: 40px }
  .ring b { font-size: 15px }
  .urlform { flex-wrap: wrap }
  .urlform input { min-width: 140px }
  .urlform button { width: 100% }
  .value-items { grid-template-columns: 1fr }
  .navright .btn { padding: 11px 13px }
  .brand { font-size: 19px }
}
.brand .cernly-mark { width: 25px; height: 25px; flex: none; display: block; }
@media (max-width: 1000px) and (min-width: 761px) { .how-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 760px) { .how-grid { grid-template-columns: 1fr; } }
`;

const CernlyMark = () => (
  <svg aria-hidden="true" className="cernly-mark" focusable="false" viewBox="195 175 895 875" xmlns="http://www.w3.org/2000/svg">
    <path d="M210.88,597.17c-1.92.12-3.93-.58-4.48-1.24s-.97-3.06-.76-3.98c11.39-48.88,50.84-84.6,92.76-109.56,22.3-13.27,43.7-26.1,64.87-41.11,52.4-37.15,79.11-75.36,113.03-127.89l22.43-34.73c32.23-45.08,77.97-78.01,131.24-93.68,1.22-.36,3.93.09,4.54.91,4.51,6.07,2.51,50.21,1.38,67.19-3.77,56.96-14.7,113.18-38.87,164.93-13.55,29-31.57,54.3-54.59,76.43-27.97,26.89-60.01,47.21-96.52,60.57-21.05,7.7-41.49,13.71-63.62,18.52-56.54,12.3-113.27,20.1-171.42,23.65Z" fill="currentColor"/>
    <path d="M1075.29,597.22c-31.29-1.76-60.75-5.23-91.32-10.14-37.13-5.96-73.16-12.14-109.51-21.48-27.2-6.99-52.73-16.08-77.11-30.07-33.58-19.26-62.54-45.19-85.19-76.57-48.6-67.35-61.22-165.28-63.01-246.88l.74-24.19c.05-1.52,3.3-3.46,5.17-2.9,53.27,15.99,99.4,48.96,131.58,94.27l22.01,34.17c13.38,20.77,26.25,40.89,41.62,60.34,22.14,28.03,47.79,51.58,77.4,71.53l58.53,36.52c42.76,26.68,80.77,59.15,93.2,109.88.25,1.03.24,2.45.06,3.15-.23.87-2.89,2.45-4.15,2.38Z" fill="currentColor"/>
    <path d="M797.68,922.67c-32.2,56.52-79.76,98.45-142.12,117.91-2.48.77-5.89-.81-6-3.3l-1.25-29.38c.14-35.36,2.94-69.78,8.88-104.64,13.49-79.23,45.35-148.57,105.28-202.8,48.34-43.74,98.6-62.82,162.34-73.88,48.62-8.44,96.94-12.45,146.2-14.26,3.25-.12,7.35-.34,8.71,2.82-6.63,31.45-27.79,62.34-51.1,84.47-14.25,13.53-29.63,24.26-46.24,34.8l-57.5,36.51c-60.34,41.66-91.74,89.48-127.22,151.75Z" fill="currentColor"/>
    <path d="M514.03,962.58c-12.71-15.68-22.44-31.35-32.26-48.38-33.85-58.7-64.66-101.62-121.01-140.94l-53.53-34.47c-14.35-9.24-27.95-18.02-40.98-29.06-21.42-18.16-38.67-39.75-50.78-65.11-4.26-8.93-11.63-27.71-9.12-30.62.57-.66,2.66-1.41,3.76-1.35,48.35,2.7,95.64,7.89,143.41,15.64,62.11,10.07,110.39,25.7,159.44,65.72,46.02,37.55,79.42,86.64,97.86,143.16,20.51,62.84,24.72,132.93,23.74,198.93-.02,1.03-1.13,3.48-1.92,4.05-.95.69-3.35.77-5,.24-44.69-14.26-83.75-41-113.6-77.81Z" fill="currentColor"/>
  </svg>
);

export default function Home() {
  const router = useRouter();
  const [urlInput, setUrlInput] = useState('');
  const [toast, setToast] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [activeFeature, setActiveFeature] = useState('performance');
  const toastTimerRef = useRef(null);
  const featureSectionRef = useRef(null);
  const scrollFrameRef = useRef(null);

  function notice(msg) {
    setToast(msg);
    setToastVisible(true);
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastVisible(false), 4200);
  }

  function handleFormSubmit(e) {
    e.preventDefault();
    if (!urlInput) return;
    try {
      const u = urlInput.startsWith('http') ? urlInput : 'https://' + urlInput;
      new URL(u);
      router.push('/analyze?url=' + encodeURIComponent(u));
    } catch {
      notice('Please enter a valid URL, e.g. https://yourwebsite.com');
    }
  }

  useEffect(() => {
    const panels = document.querySelectorAll('.feature-panel');
    const section = featureSectionRef.current;
    if (!section || panels.length === 0) return;

    function updateActive() {
      scrollFrameRef.current = null;
      const bounds = section.getBoundingClientRect();
      if (bounds.bottom <= 0 || bounds.top >= window.innerHeight) return;
      const referenceY = window.innerHeight * 0.36;
      let current = panels[0].id;
      for (const panel of panels) {
        if (panel.getBoundingClientRect().top <= referenceY) current = panel.id;
        else break;
      }
      setActiveFeature(current);
    }

    function schedule() {
      if (scrollFrameRef.current === null)
        scrollFrameRef.current = requestAnimationFrame(updateActive);
    }

    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    schedule();
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (scrollFrameRef.current) cancelAnimationFrame(scrollFrameRef.current);
    };
  }, []);

  function scrollToFeature(id) {
    setActiveFeature(id);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start'
    });
  }

  const featureTabs = [
    { id: 'performance', label: 'Performance' },
    { id: 'seo', label: 'SEO' },
    { id: 'accessibility', label: 'Accessibility' },
    { id: 'security', label: 'Security' },
    { id: 'action', label: 'AI action plan' },
  ];

  return (
    <>
      <style>{CSS}</style>

      <svg aria-hidden="true" style={{position:'absolute',width:0,height:0,overflow:'hidden'}} xmlns="http://www.w3.org/2000/svg">
        <symbol id="i-spark" viewBox="0 0 24 24"><path d="M12 2.5c1.4 5.1 4.4 8.1 9.5 9.5-5.1 1.4-8.1 4.4-9.5 9.5-1.4-5.1-4.4-8.1-9.5-9.5 5.1-1.4 8.1-4.4 9.5-9.5Z"/></symbol>
        <symbol id="i-check" viewBox="0 0 24 24"><path d="m5 12 4.5 4.5L19 7"/></symbol>
        <symbol id="i-link" viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7 .3l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7-.3l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></symbol>
        <symbol id="i-arrow" viewBox="0 0 24 24"><path d="M4 12h16m-7-7 7 7-7 7"/></symbol>
        <symbol id="i-gauge" viewBox="0 0 24 24"><path d="M5 18a9 9 0 1 1 14 0H5Z"/><path d="m12 13 4-5M12 18h.01"/></symbol>
        <symbol id="i-search" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></symbol>
        <symbol id="i-list" viewBox="0 0 24 24"><path d="M9 6h12M9 12h12M9 18h12M3 6h.01M3 12h.01M3 18h.01"/></symbol>
        <symbol id="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></symbol>
        <symbol id="i-wordpress" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M4.5 7.5h4M16 7.5h3M6 8l4.5 11L13 12l2.5 7L19 8M11 7.5h4"/></symbol>
        <symbol id="i-alert" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 4h.01"/></symbol>
      </svg>

      <header className="topbar">
        <div className="wrap nav">
          <a aria-label="Cernly home" className="brand" href="#top">
            <CernlyMark />
            cernly<span>.ai</span>
          </a>
          <nav aria-label="Main navigation" className="navlinks">
            <a href="#features">Features</a>
            <a href="#how">How it works</a>
            <a href="#pricing">Pricing</a>
          </nav>
          <div className="navright">
            <a href="/sign-in">Sign In</a>
            <a className="btn btn-dark" href="#start">Try it free <svg className="icon sm"><use href="#i-arrow"/></svg></a>
          </div>
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <div className="wrap hero-grid">
            <div className="hero-copy">
              <span className="eyebrow">Your website, explained</span>
              <h1>See what&apos;s holding your website <span className="gradient-text">back.</span></h1>
              <p>One scan. Clear answers. Smarter fixes. Find performance, SEO, security, and accessibility issues—and know what to do next.</p>
              <form className="urlform" id="hero-form" onSubmit={handleFormSubmit}>
                <svg className="icon"><use href="#i-link"/></svg>
                <input
                  aria-label="Website URL"
                  placeholder="https://yourwebsite.com"
                  required
                  type="url"
                  value={urlInput}
                  onChange={e => setUrlInput(e.target.value)}
                />
                <button className="btn btn-gradient" type="submit">
                  Scan my site <svg className="icon sm"><use href="#i-arrow"/></svg>
                </button>
              </form>
            </div>
            <div className="hero-visual">
              <div className="glow"/>
              <div className="window">
                <div className="windowbar">
                  <span className="dot"/><span className="dot"/><span className="dot"/>
                  <span className="windowurl">cernly.ai / example audit</span>
                </div>
                <div className="dashboard">
                  <div className="dash-head">
                    <div><strong>example.com</strong><br/><small>Website health overview · Demo data</small></div>
                    <span className="pill">AI analysis</span>
                  </div>
                  <div className="scores">
                    <div className="score"><div className="ring" style={{"--n":88,"--c":"#24bc8b"}}><b>88</b></div><small>Performance</small></div>
                    <div className="score"><div className="ring" style={{"--n":76,"--c":"#4d83f9"}}><b>76</b></div><small>SEO</small></div>
                    <div className="score"><div className="ring" style={{"--n":92,"--c":"#23bc8c"}}><b>92</b></div><small>Security</small></div>
                    <div className="score"><div className="ring" style={{"--n":68,"--c":"#ee7a84"}}><b>68</b></div><small>Accessibility</small></div>
                  </div>
                  <div className="summary">
                    <strong><svg className="icon sm"><use href="#i-spark"/></svg> Cernly&apos;s take</strong>
                    <p>Your site&apos;s foundation looks good. A few improvements to mobile loading and accessibility could make a meaningful difference. Start with these three fixes.</p>
                  </div>
                  <div className="issue-title"><b>Your top priorities</b><span>Ranked by potential impact</span></div>
                  <div className="issue"><span className="num">01</span><span className="label">Improve image loading on mobile</span><span className="severity">High</span></div>
                  <div className="issue"><span className="num">02</span><span className="label">Add missing accessible labels</span><span className="severity">High</span></div>
                  <div className="issue"><span className="num">03</span><span className="label">Review page title structure</span><span className="severity low">Medium</span></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="dark-band">
          <div className="wrap value-grid">
            <div>
              <span className="eyebrow">Clarity over complexity</span>
              <h2>Less noise.<br/>More <span style={{color:"#a992ff"}}>clarity.</span></h2>
              <p>Most website tools hand you scores and leave you to figure out the rest. Cernly connects the dots—so you know what matters, why it matters, and what to fix first.</p>
            </div>
            <div className="value-items">
              <div className="value-item"><svg className="icon lg"><use href="#i-gauge"/></svg><strong>See the full picture</strong><small>Understand speed, visibility, accessibility, and security together.</small></div>
              <div className="value-item"><svg className="icon lg"><use href="#i-spark"/></svg><strong>Get clear direction</strong><small>Turn technical findings into an understandable action plan.</small></div>
              <div className="value-item"><svg className="icon lg"><use href="#i-list"/></svg><strong>Know what comes first</strong><small>Focus on high-impact fixes instead of chasing every warning.</small></div>
              <div className="value-item"><svg className="icon lg"><use href="#i-clock"/></svg><strong>Save your time</strong><small>Get useful answers without juggling a stack of separate tools.</small></div>
            </div>
          </div>
        </section>

        <section className="section features" id="features" ref={featureSectionRef}>
          <div className="wrap">
            <div className="intro">
              <span className="eyebrow">What Cernly checks</span>
              <h2>Everything that matters.<br/><span style={{color:"#999eaa"}}>Nothing you don&apos;t need.</span></h2>
              <p>Explore the signals behind a healthier website. Each finding comes with context—not just another red warning.</p>
            </div>
            <div className="feature-layout">
              <nav aria-label="Audit feature navigation" className="feature-nav">
                {featureTabs.map(tab => (
                  <button
                    key={tab.id}
                    className={`feature-tab${activeFeature === tab.id ? ' active' : ''}`}
                    aria-current={activeFeature === tab.id ? 'true' : 'false'}
                    onClick={() => scrollToFeature(tab.id)}
                  >{tab.label}</button>
                ))}
              </nav>
              <div className="feature-stack">
                <article className="feature-panel" id="performance">
                  <span className="eyebrow">01 / Performance</span>
                  <h3>Make every second count.</h3>
                  <p>See how quickly your site loads, what slows it down, and which improvements are worth your time.</p>
                  <div className="feature-art">
                    <div className="art-window">
                      <div className="art-heading">Page load performance <span>Illustrative metrics</span></div>
                      <svg aria-label="Illustrative page performance trend" className="chart" preserveAspectRatio="none" role="img" viewBox="0 0 620 155">
                        <defs>
                          <linearGradient id="chartfill" x1="0" x2="0" y1="0" y2="1">
                            <stop stopColor="#8056fb" stopOpacity=".19"/>
                            <stop offset="1" stopColor="#8056fb" stopOpacity="0"/>
                          </linearGradient>
                        </defs>
                        <path d="M0 125H620M0 85H620M0 45H620" stroke="#eef0f6" strokeDasharray="4 6"/>
                        <path d="M0 118 C45 112 68 78 110 89S178 120 220 90 276 50 310 68 365 93 408 52 460 61 502 37 557 52 620 20 V155H0Z" fill="url(#chartfill)"/>
                        <path d="M0 118 C45 112 68 78 110 89S178 120 220 90 276 50 310 68 365 93 408 52 460 61 502 37 557 52 620 20" fill="none" stroke="#7954f7" strokeLinecap="round" strokeWidth="3.5"/>
                        <circle cx="620" cy="20" fill="#7954f7" r="6" stroke="white" strokeWidth="3"/>
                      </svg>
                      <div className="art-foot"><span><b>LCP</b> 2.4s</span><span><b>CLS</b> 0.02</span><span><b>Blocking time</b> 180ms</span></div>
                    </div>
                  </div>
                </article>

                <article className="feature-panel" id="seo">
                  <span className="eyebrow">02 / Search visibility</span>
                  <h3>Help people find you.</h3>
                  <p>Spot overlooked SEO fundamentals, from metadata and headings to indexability and structured content.</p>
                  <div className="feature-art">
                    <div className="art-window">
                      <div className="art-heading">Search readiness <span>Example findings</span></div>
                      <div className="audit-row"><svg className="icon"><use href="#i-check"/></svg><span>Page title is present</span><small>Passed</small></div>
                      <div className="audit-row"><svg className="icon"><use href="#i-check"/></svg><span>Canonical URL is defined</span><small>Passed</small></div>
                      <div className="audit-row warn"><svg className="icon"><use href="#i-alert"/></svg><span>Meta description could be improved</span><small>Review</small></div>
                      <div className="audit-row bad"><svg className="icon"><use href="#i-alert"/></svg><span>Structured data is missing</span><small>Action needed</small></div>
                      <div className="audit-row"><svg className="icon"><use href="#i-check"/></svg><span>Page is indexable</span><small>Passed</small></div>
                    </div>
                  </div>
                </article>

                <article className="feature-panel" id="accessibility">
                  <span className="eyebrow">03 / Accessibility</span>
                  <h3>Make your site work for more people.</h3>
                  <p>Catch common barriers in images, forms, contrast, and navigation—and get practical suggestions to address them.</p>
                  <div className="feature-art">
                    <div className="art-window">
                      <div className="art-heading">Accessibility review <span>Example findings</span></div>
                      <div className="audit-row bad"><svg className="icon"><use href="#i-alert"/></svg><span>Buttons without accessible names</span><small>High impact</small></div>
                      <div className="audit-row warn"><svg className="icon"><use href="#i-alert"/></svg><span>Low-contrast text on light backgrounds</span><small>Review</small></div>
                      <div className="audit-row"><svg className="icon"><use href="#i-check"/></svg><span>Document language is specified</span><small>Passed</small></div>
                      <div className="audit-row warn"><svg className="icon"><use href="#i-alert"/></svg><span>Some images need text alternatives</span><small>Review</small></div>
                    </div>
                  </div>
                </article>

                <article className="feature-panel" id="security">
                  <span className="eyebrow">04 / Security</span>
                  <h3>Find the gaps you can&apos;t see.</h3>
                  <p>Check the public-facing security basics, including HTTPS configuration and response headers, without becoming a security expert.</p>
                  <div className="feature-art">
                    <div className="art-window">
                      <div className="art-heading">Security essentials <span>Example findings</span></div>
                      <div className="audit-row"><svg className="icon"><use href="#i-check"/></svg><span>HTTPS connection enabled</span><small>Passed</small></div>
                      <div className="audit-row"><svg className="icon"><use href="#i-check"/></svg><span>HSTS header detected</span><small>Passed</small></div>
                      <div className="audit-row warn"><svg className="icon"><use href="#i-alert"/></svg><span>Content Security Policy needs review</span><small>Review</small></div>
                      <div className="audit-row"><svg className="icon"><use href="#i-check"/></svg><span>HTTPS redirect working</span><small>Passed</small></div>
                    </div>
                  </div>
                </article>

                <article className="feature-panel" id="action">
                  <span className="eyebrow">05 / Your next steps</span>
                  <h3>Finally, a report that tells you what to do.</h3>
                  <p>Cernly translates audit results into prioritized, plain-English recommendations you can use yourself or share with your team.</p>
                  <div className="feature-art">
                    <div className="art-window">
                      <div className="art-heading">
                        <span style={{display:'flex',alignItems:'center',gap:'7px',color:'#6f50dc',fontWeight:800}}>
                          <svg className="icon sm"><use href="#i-spark"/></svg> Your suggested action plan
                        </span>
                        <span>Illustrative example</span>
                      </div>
                      <div className="priority"><span className="n">1</span><div><b>Optimize the largest homepage image</b><p>Reduce download size to improve the first impression on slower connections.</p></div><em>Start here</em></div>
                      <div className="priority"><span className="n">2</span><div><b>Label the newsletter form fields</b><p>Help assistive technology identify what each field is asking for.</p></div><em>Next</em></div>
                      <div className="priority"><span className="n">3</span><div><b>Improve your page description</b><p>Make the page&apos;s purpose clearer in search previews.</p></div><em>Next</em></div>
                    </div>
                  </div>
                </article>
              </div>
            </div>
          </div>
        </section>

        <section className="section pathways" id="start">
          <div className="wrap pathway-grid">
            <div className="pathway-intro">
              <span className="eyebrow">Two ways to get started</span>
              <h2>Scan any site.<br/>Or connect WordPress.</h2>
              <p>Whether you want a quick snapshot or ongoing visibility, start in the way that works for you.</p>
            </div>
            <div className="path-card">
              <div className="icon-tile"><svg className="icon lg"><use href="#i-search"/></svg></div>
              <h3>Scan any website</h3>
              <p>Enter a public URL and see what your site is doing well—and where it could improve.</p>
              <ul className="ticks">
                <li><svg className="icon"><use href="#i-check"/></svg>No installation needed</li>
                <li><svg className="icon"><use href="#i-check"/></svg>Clear scores and findings</li>
                <li><svg className="icon"><use href="#i-check"/></svg>Practical recommendations</li>
              </ul>
              <a className="btn btn-gradient" href="#top">Scan a website <svg className="icon sm"><use href="#i-arrow"/></svg></a>
            </div>
            <div className="path-card">
              <div className="icon-tile wp"><svg className="icon lg"><use href="#i-wordpress"/></svg></div>
              <h3>Connect your WordPress site</h3>
              <p>Bring website insights closer to where you manage your content, with the Cernly WordPress integration.</p>
              <ul className="ticks">
                <li><svg className="icon"><use href="#i-check"/></svg>Built for WordPress workflows</li>
                <li><svg className="icon"><use href="#i-check"/></svg>Review issues alongside your site</li>
                <li><svg className="icon"><use href="#i-check"/></svg>Room to grow into monitoring</li>
              </ul>
              <button className="btn btn-light" type="button" onClick={() => notice('WordPress plugin availability and setup will be linked here.')}>
                Explore WordPress plugin <svg className="icon sm"><use href="#i-arrow"/></svg>
              </button>
            </div>
          </div>
        </section>

        <section className="section" id="how">
          <div className="wrap">
            <div className="intro">
              <span className="eyebrow">Simple by design</span>
              <h2>From question to action.<br/>Without the guesswork.</h2>
            </div>
            <div className="how-grid">
              <div className="how-card"><span className="number">01</span><h3>Paste your URL</h3><p>No account, no setup. Just a URL. Works on any publicly accessible site.</p></div>
              <div className="how-card"><span className="number">02</span><h3>We run 47 checks</h3><p>Speed, SEO, security, and accessibility checks run in parallel — done in under 60 seconds.</p></div>
              <div className="how-card"><span className="number">03</span><h3>AI writes your plan</h3><p>Claude analyzes your results and writes a prioritized fix list in plain language.</p></div>
              <div className="how-card"><span className="number">04</span><h3>Fix it, re-check</h3><p>Make changes and run another scan. Track progress over time with a Pro account.</p></div>
            </div>
          </div>
        </section>

        <section className="section pricing" id="pricing">
          <div className="wrap">
            <div className="intro">
              <span className="eyebrow">Straightforward pricing</span>
              <h2>Start free. Go deeper when you&apos;re ready.</h2>
              <p>Keep the barrier to getting useful answers low.</p>
            </div>
            <div className="price-grid">
              <div className="plan">
                <span className="tag">Get a snapshot</span>
                <div className="price">$0</div>
                <p>Understand your website at a glance.</p>
                <ul>
                  <li><svg className="icon"><use href="#i-check"/></svg>Core website scores</li>
                  <li><svg className="icon"><use href="#i-check"/></svg>Top findings preview</li>
                  <li><svg className="icon"><use href="#i-check"/></svg>No account to start</li>
                </ul>
                <a className="btn btn-light" href="#top">Start free <svg className="icon sm"><use href="#i-arrow"/></svg></a>
              </div>
              <div className="plan featured">
                <span className="tag">Most useful for one-time audits</span>
                <div className="price">$4.99</div>
                <p>One-time report · No subscription</p>
                <ul>
                  <li><svg className="icon"><use href="#i-check"/></svg>Detailed audit findings</li>
                  <li><svg className="icon"><use href="#i-check"/></svg>Prioritized AI action plan</li>
                  <li><svg className="icon"><use href="#i-check"/></svg>Shareable report</li>
                </ul>
                <a className="btn btn-gradient" href="#top">Unlock full report <svg className="icon sm"><use href="#i-arrow"/></svg></a>
              </div>
              <div className="plan">
                <span className="tag">For ongoing improvement</span>
                <div className="price">Pro <small>coming later</small></div>
                <p>More visibility as your website grows.</p>
                <ul>
                  <li><svg className="icon"><use href="#i-check"/></svg>Repeat audits</li>
                  <li><svg className="icon"><use href="#i-check"/></svg>History and trends</li>
                  <li><svg className="icon"><use href="#i-check"/></svg>WordPress integration</li>
                </ul>
                <button className="btn btn-light" type="button" onClick={() => notice('Pro plan details are still being finalized.')}>
                  Explore Pro <svg className="icon sm"><use href="#i-arrow"/></svg>
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="closing">
          <div className="wrap">
            <span className="eyebrow">Your next step starts here</span>
            <h2>A better website starts with <span className="gradient-text">knowing what to fix.</span></h2>
            <p>Less second-guessing. More meaningful improvements.</p>
            <a className="btn btn-gradient" href="#top">Scan your website <svg className="icon sm"><use href="#i-arrow"/></svg></a>
          </div>
        </section>
      </main>

      <footer>
        <div className="wrap footer-inner">
          <a className="brand" href="#top">
            <CernlyMark />
            cernly<span>.ai</span>
          </a>
          <div className="footerlinks">
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <a href="mailto:hello@cernly.ai">Contact</a>
          </div>
          <small>© 2026 Cernly</small>
        </div>
      </footer>

      <div aria-live="polite" className={`toast${toastVisible ? ' show' : ''}`} role="status">{toast}</div>
    </>
  );
}
