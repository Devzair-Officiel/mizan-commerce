import { Nav } from '@/components/marketing/Nav';
import { Hero } from '@/components/marketing/Hero';
import { Problem } from '@/components/marketing/Problem';
import { Features } from '@/components/marketing/Features';
import { How } from '@/components/marketing/How';
import { Halal } from '@/components/marketing/Halal';
import { Pricing } from '@/components/marketing/Pricing';
import { Faq } from '@/components/marketing/Faq';
import { FinalCta } from '@/components/marketing/FinalCta';
import { Footer } from '@/components/marketing/Footer';

export default function LandingPage() {
  return (
    <>
      <Nav />
      <Hero />
      <Problem />
      <Features />
      <How />
      <Halal />
      <Pricing />
      <Faq />
      <FinalCta />
      <Footer />
    </>
  );
}
