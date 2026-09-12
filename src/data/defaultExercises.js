// Seed library of common lifts. Users can add/edit/delete custom exercises.
// `id` values are stable and namespaced so backups/imports are portable.
export const DEFAULT_EXERCISES = [
  // Chest
  { id: 'ex_bench_press', name: 'Bench Press', muscleGroups: ['Chest', 'Triceps', 'Shoulders'], equipment: 'Barbell', defaultReps: [6, 10], defaultRestSec: 180, builtin: true },
  { id: 'ex_incline_db_press', name: 'Incline Dumbbell Press', muscleGroups: ['Chest', 'Shoulders'], equipment: 'Dumbbell', defaultReps: [8, 12], defaultRestSec: 120, builtin: true },
  { id: 'ex_dips', name: 'Dips', muscleGroups: ['Chest', 'Triceps'], equipment: 'Bodyweight', defaultReps: [6, 12], defaultRestSec: 120, builtin: true },
  { id: 'ex_cable_fly', name: 'Cable Fly', muscleGroups: ['Chest'], equipment: 'Cable', defaultReps: [10, 15], defaultRestSec: 90, builtin: true },
  // Back
  { id: 'ex_deadlift', name: 'Deadlift', muscleGroups: ['Back', 'Hamstrings', 'Glutes'], equipment: 'Barbell', defaultReps: [3, 6], defaultRestSec: 240, builtin: true },
  { id: 'ex_pullup', name: 'Pull-Up', muscleGroups: ['Back', 'Biceps'], equipment: 'Bodyweight', defaultReps: [5, 10], defaultRestSec: 150, builtin: true },
  { id: 'ex_barbell_row', name: 'Barbell Row', muscleGroups: ['Back', 'Biceps'], equipment: 'Barbell', defaultReps: [6, 10], defaultRestSec: 150, builtin: true },
  { id: 'ex_lat_pulldown', name: 'Lat Pulldown', muscleGroups: ['Back', 'Biceps'], equipment: 'Cable', defaultReps: [8, 12], defaultRestSec: 120, builtin: true },
  { id: 'ex_seated_row', name: 'Seated Cable Row', muscleGroups: ['Back'], equipment: 'Cable', defaultReps: [8, 12], defaultRestSec: 120, builtin: true },
  // Shoulders
  { id: 'ex_ohp', name: 'Overhead Press', muscleGroups: ['Shoulders', 'Triceps'], equipment: 'Barbell', defaultReps: [5, 8], defaultRestSec: 180, builtin: true },
  { id: 'ex_db_shoulder_press', name: 'Dumbbell Shoulder Press', muscleGroups: ['Shoulders'], equipment: 'Dumbbell', defaultReps: [8, 12], defaultRestSec: 120, builtin: true },
  { id: 'ex_lateral_raise', name: 'Lateral Raise', muscleGroups: ['Shoulders'], equipment: 'Dumbbell', defaultReps: [10, 15], defaultRestSec: 60, builtin: true },
  { id: 'ex_rear_delt_fly', name: 'Rear Delt Fly', muscleGroups: ['Shoulders'], equipment: 'Dumbbell', defaultReps: [10, 15], defaultRestSec: 60, builtin: true },
  // Biceps
  { id: 'ex_barbell_curl', name: 'Barbell Curl', muscleGroups: ['Biceps'], equipment: 'Barbell', defaultReps: [8, 12], defaultRestSec: 90, builtin: true },
  { id: 'ex_hammer_curl', name: 'Hammer Curl', muscleGroups: ['Biceps'], equipment: 'Dumbbell', defaultReps: [10, 12], defaultRestSec: 90, builtin: true },
  { id: 'ex_incline_db_curl', name: 'Incline Dumbbell Curl', muscleGroups: ['Biceps'], equipment: 'Dumbbell', defaultReps: [10, 12], defaultRestSec: 90, builtin: true },
  // Triceps
  { id: 'ex_close_grip_bench', name: 'Close-Grip Bench', muscleGroups: ['Triceps', 'Chest'], equipment: 'Barbell', defaultReps: [6, 10], defaultRestSec: 150, builtin: true },
  { id: 'ex_tricep_pushdown', name: 'Tricep Pushdown', muscleGroups: ['Triceps'], equipment: 'Cable', defaultReps: [10, 15], defaultRestSec: 60, builtin: true },
  { id: 'ex_overhead_ext', name: 'Overhead Tricep Ext.', muscleGroups: ['Triceps'], equipment: 'Cable', defaultReps: [10, 12], defaultRestSec: 90, builtin: true },
  // Quads
  { id: 'ex_squat', name: 'Back Squat', muscleGroups: ['Quads', 'Glutes'], equipment: 'Barbell', defaultReps: [5, 8], defaultRestSec: 210, builtin: true },
  { id: 'ex_front_squat', name: 'Front Squat', muscleGroups: ['Quads'], equipment: 'Barbell', defaultReps: [5, 8], defaultRestSec: 180, builtin: true },
  { id: 'ex_leg_press', name: 'Leg Press', muscleGroups: ['Quads', 'Glutes'], equipment: 'Machine', defaultReps: [8, 12], defaultRestSec: 150, builtin: true },
  { id: 'ex_leg_extension', name: 'Leg Extension', muscleGroups: ['Quads'], equipment: 'Machine', defaultReps: [10, 15], defaultRestSec: 60, builtin: true },
  { id: 'ex_bulgarian_split', name: 'Bulgarian Split Squat', muscleGroups: ['Quads', 'Glutes'], equipment: 'Dumbbell', defaultReps: [8, 12], defaultRestSec: 120, builtin: true },
  // Hamstrings
  { id: 'ex_rdl', name: 'Romanian Deadlift', muscleGroups: ['Hamstrings', 'Glutes'], equipment: 'Barbell', defaultReps: [6, 10], defaultRestSec: 150, builtin: true },
  { id: 'ex_leg_curl', name: 'Leg Curl', muscleGroups: ['Hamstrings'], equipment: 'Machine', defaultReps: [10, 15], defaultRestSec: 90, builtin: true },
  // Glutes
  { id: 'ex_hip_thrust', name: 'Hip Thrust', muscleGroups: ['Glutes', 'Hamstrings'], equipment: 'Barbell', defaultReps: [8, 12], defaultRestSec: 120, builtin: true },
  // Calves
  { id: 'ex_standing_calf', name: 'Standing Calf Raise', muscleGroups: ['Calves'], equipment: 'Machine', defaultReps: [10, 15], defaultRestSec: 60, builtin: true },
  { id: 'ex_seated_calf', name: 'Seated Calf Raise', muscleGroups: ['Calves'], equipment: 'Machine', defaultReps: [12, 20], defaultRestSec: 60, builtin: true },
  // Core
  { id: 'ex_plank', name: 'Plank', muscleGroups: ['Core'], equipment: 'Bodyweight', defaultReps: [30, 60], defaultRestSec: 60, builtin: true },
  { id: 'ex_hanging_leg_raise', name: 'Hanging Leg Raise', muscleGroups: ['Core'], equipment: 'Bodyweight', defaultReps: [8, 15], defaultRestSec: 60, builtin: true },
  { id: 'ex_cable_crunch', name: 'Cable Crunch', muscleGroups: ['Core'], equipment: 'Cable', defaultReps: [10, 15], defaultRestSec: 60, builtin: true }
];

export const MUSCLE_GROUPS = ['Chest','Back','Shoulders','Biceps','Triceps','Quads','Hamstrings','Glutes','Calves','Core'];
export const EQUIPMENT = ['Barbell','Dumbbell','Machine','Cable','Bodyweight','Kettlebell','Other'];
