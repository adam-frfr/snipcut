import React from "react";
import Navbar from "@/components/Navbar";
import PricingSection from "@/components/PricingSection";
import FaqSection from "@/components/FaqSection";
import Footer from "@/components/Footer";

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-[#F5EFEB] text-[#2B1D16] pt-16">
      <Navbar />
      <PricingSection />
      <FaqSection />
      <Footer />
    </main>
  );
}
