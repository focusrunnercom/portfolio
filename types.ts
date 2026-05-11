
import type React from 'react';

export interface Service {
  icon: React.ReactNode;
  title: string;
  description: string;
}

export interface CaseStudy {
  industry: string;
  title: string;
  description: string;
  metrics: { value: string; label: string }[];
}
