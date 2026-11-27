import { getStudents, getPracticeSessions, getMonthlyAchievements, updateMonthlyAchievement, getCurrentUser } from './storage';
import { logger } from './logger';

/**
 * Recalculate monthly achievements for all students based on their practice sessions
 * This should be called after data sync to ensure achievements reflect current data
 */
export const recalculateAllMonthlyAchievements = (): void => {
  logger.info('🔄 Recalculating monthly achievements for all students...');
  
  // A student's device only has (and may only save) her own achievements.
  const user = getCurrentUser();
  const students = user?.type === 'student'
    ? getStudents().filter(s => s.id === user.studentId)
    : getStudents();
  const allSessions = getPracticeSessions();
  
  students.forEach(student => {
    const studentSessions = allSessions.filter(s => s.studentId === student.id);
    
    // Group sessions by month
    const sessionsByMonth = new Map<string, typeof studentSessions>();
    
    studentSessions.forEach(session => {
      const month = session.date.slice(0, 7); // YYYY-MM
      if (!sessionsByMonth.has(month)) {
        sessionsByMonth.set(month, []);
      }
      sessionsByMonth.get(month)!.push(session);
    });
    
    // Recalculate achievements for each month
    sessionsByMonth.forEach((sessions, month) => {
      const achievements = calculateMonthAchievements(sessions);
      
      // Only update if there are actual achievements
      if (achievements.maxDailyMinutes > 0 || achievements.maxStreak > 0) {
        updateMonthlyAchievement(student.id, achievements);
      }
    });
  });
  
  logger.info('✅ Monthly achievements recalculated');
};

/**
 * Calculate achievements from practice sessions
 */
const calculateMonthAchievements = (sessions: any[]): {
  maxDailyAverage: number;
  maxDailyMinutes: number;
  maxStreak: number;
} => {
  if (sessions.length === 0) {
    return { maxDailyAverage: 0, maxDailyMinutes: 0, maxStreak: 0 };
  }
  
  // Group by date
  const dailyTotals = new Map<string, number>();
  sessions.forEach(session => {
    const current = dailyTotals.get(session.date) || 0;
    dailyTotals.set(session.date, current + session.minutes);
  });
  
  // Calculate max daily minutes
  const maxDailyMinutes = Math.max(...Array.from(dailyTotals.values()));
  
  // Calculate max daily average (over 7 days)
  const sortedDates = Array.from(dailyTotals.keys()).sort();
  let maxDailyAverage = 0;
  
  for (let i = 0; i < sortedDates.length; i++) {
    const endDate = new Date(sortedDates[i]);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 6);
    
    const weekTotal = sortedDates
      .filter(date => {
        const d = new Date(date);
        return d >= startDate && d <= endDate;
      })
      .reduce((sum, date) => sum + (dailyTotals.get(date) || 0), 0);
    
    const weekAverage = Math.round(weekTotal / 7);
    maxDailyAverage = Math.max(maxDailyAverage, weekAverage);
  }
  
  // Calculate max streak
  let maxStreak = 0;
  let currentStreak = 0;
  let previousDate: Date | null = null;
  
  sortedDates.forEach(dateStr => {
    const currentDate = new Date(dateStr);
    
    if (previousDate) {
      const dayDiff = Math.floor((currentDate.getTime() - previousDate.getTime()) / (1000 * 60 * 60 * 24));
      
      if (dayDiff === 1) {
        currentStreak++;
      } else {
        maxStreak = Math.max(maxStreak, currentStreak);
        currentStreak = 1;
      }
    } else {
      currentStreak = 1;
    }
    
    previousDate = currentDate;
  });
  
  maxStreak = Math.max(maxStreak, currentStreak);
  
  return {
    maxDailyAverage,
    maxDailyMinutes,
    maxStreak
  };
};
