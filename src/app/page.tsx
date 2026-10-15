import React from "react";
import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import InteractiveDemo from "@/components/InteractiveDemo";
import FeaturesSection from "@/components/FeaturesSection";
import RoiCalculator from "@/components/RoiCalculator";
import PricingSection from "@/components/PricingSection";
import FaqSection from "@/components/FaqSection";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#08090E] text-white selection:bg-purple-600 selection:text-white">
      <Navbar />
      <HeroSection />
      <InteractiveDemo />
      <FeaturesSection />
      <RoiCalculator />
      <PricingSection />
      <FaqSection />
      <Footer />
    </main>
  );
}
