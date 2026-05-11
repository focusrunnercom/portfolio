
import React from 'react';
import type { Service, CaseStudy } from './types';

const VoiceAgentIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
        <line x1="12" y1="19" x2="12" y2="23"></line>
        <line x1="8" y1="23" x2="16" y2="23"></line>
    </svg>
);

const WorkflowIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7"></rect>
        <rect x="14" y="3" width="7" height="7"></rect>
        <rect x="14" y="14" width="7" height="7"></rect>
        <rect x="3" y="14" width="7" height="7"></rect>
        <line x1="10" y1="6" x2="14" y2="6"></line>
        <line x1="17" y1="10" x2="17" y2="14"></line>
        <line x1="10" y1="17" x2="6" y2="17"></line>
    </svg>
);

const EmailIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
        <polyline points="22,6 12,13 2,6"></polyline>
        <path d="m14.5 10.5-2-2-2 2"></path><path d="m12.5 13.5 2 2 2-2"></path>
    </svg>
);

export const SERVICES: Service[] = [
  {
    icon: <VoiceAgentIcon />,
    title: 'AI Voice Agents',
    description: 'Deploy intelligent, human-like voice agents to handle customer calls, qualify leads, and provide 24/7 support, drastically reducing your operational costs.'
  },
  {
    icon: <WorkflowIcon />,
    title: 'Workflow Automation',
    description: 'Streamline your entire marketing pipeline. We automate repetitive tasks from lead capture and nurturing to sales follow-ups, freeing up your team to focus on strategy.'
  },
  {
    icon: <EmailIcon />,
    title: 'Email Marketing Automation',
    description: 'Launch hyper-personalized email campaigns that convert. Our AI analyzes customer behavior to deliver the right message at the right time, boosting engagement and ROI.'
  }
];

export const CASE_STUDIES: CaseStudy[] = [
  {
    industry: 'SaaS',
    title: 'AI Voice Agent Replaces After-Hours Support',
    description: 'We deployed a 24/7 AI voice agent that handles customer inquiries overnight, qualifying leads and routing emergencies — zero engineering effort from the client.',
    metrics: [
      { value: '93%', label: 'Call Resolution Rate' },
      { value: '60%', label: 'Cost Reduction' },
    ],
  },
  {
    industry: 'E-Commerce',
    title: 'Automated Email Flows Boost Repeat Purchases',
    description: 'Built and managed hyper-personalized email campaigns triggered by browsing behavior and purchase history. The client saw immediate uplift without hiring a marketing team.',
    metrics: [
      { value: '3.2×', label: 'Email Revenue' },
      { value: '+28%', label: 'Repeat Purchase Rate' },
    ],
  },
  {
    industry: 'Real Estate',
    title: 'Lead Nurturing Pipeline Increases Close Rate',
    description: 'Automated the entire lead follow-up workflow: instant SMS/email after inquiry, scheduled call reminders, and re-engagement sequences. The brokerage closed more deals with the same agents.',
    metrics: [
      { value: '+45%', label: 'Lead-to-Showing' },
      { value: '72h', label: 'Avg Response Time (was 4 days)' },
    ],
  },
];
