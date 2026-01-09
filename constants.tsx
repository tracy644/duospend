
import React from 'react';
import { Category } from './types';

export const CATEGORY_COLORS: Record<Category, string> = {
  [Category.FOOD]: '#fb923c',      // Orange
  [Category.RENT]: '#38bdf8',      // Sky
  [Category.ENTERTAINMENT]: '#a78bfa', // Violet
  [Category.SHOPPING]: '#f472b6',  // Pink
  [Category.TRANSPORT]: '#4ade80', // Green
  [Category.HEALTH]: '#f87171',    // Red
  [Category.TRAVEL]: '#2dd4bf',    // Teal
  [Category.OTHER]: '#94a3b8'      // Slate
};

export const CATEGORY_ICONS: Record<Category, string> = {
  [Category.FOOD]: '🍔',
  [Category.RENT]: '🏠',
  [Category.ENTERTAINMENT]: '🎬',
  [Category.SHOPPING]: '🛍️',
  [Category.TRANSPORT]: '🚗',
  [Category.HEALTH]: '🏥',
  [Category.TRAVEL]: '✈️',
  [Category.OTHER]: '📦',
};
