'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';

const LINKS = [
  { href: '#features', label: 'Fonctionnalités' },
  { href: '#how', label: 'Comment ça marche' },
  { href: '#pricing', label: 'Tarifs' },
  { href: '#faq', label: 'FAQ' },
];

function BurgerIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 7h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M4 12h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function Nav() {
  const [open, setOpen] = useState(false);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <nav className="nav">
      <div className="wrap nav-inner">
        <a className="brand" href="#top" onClick={() => setOpen(false)}>
          <Image src="/landing/logo.png" alt="mizan" width={42} height={42} priority />
          <span className="wm">mizan</span>
        </a>

        <div className="nav-links">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href}>{l.label}</a>
          ))}
        </div>

        <div className="nav-right">
          <Link className="nav-login" href="/login">Se connecter</Link>
          <Link className="btn btn-gold nav-cta" href="/register">Créer un compte</Link>
        </div>

        <button
          type="button"
          className="nav-burger"
          aria-label="Ouvrir le menu"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <BurgerIcon />
        </button>
      </div>

      <div
        className={'nav-drawer' + (open ? ' open' : '')}
        role="dialog"
        aria-modal="true"
        aria-hidden={!open}
      >
        <div className="nav-drawer-header">
          <span className="brand">
            <Image src="/landing/logo.png" alt="mizan" width={36} height={36} />
            <span className="wm">mizan</span>
          </span>
          <button
            type="button"
            className="nav-drawer-close"
            aria-label="Fermer le menu"
            onClick={() => setOpen(false)}
          >
            <CloseIcon />
            <span>Fermer</span>
          </button>
        </div>
        <div className="nav-drawer-inner">
          <div className="nav-drawer-links">
            {LINKS.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setOpen(false)}>
                {l.label}
              </a>
            ))}
          </div>
          <div className="nav-drawer-actions">
            <Link className="btn btn-ghost" href="/login" onClick={() => setOpen(false)}>
              Se connecter
            </Link>
            <Link className="btn btn-gold" href="/register" onClick={() => setOpen(false)}>
              Créer un compte
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
