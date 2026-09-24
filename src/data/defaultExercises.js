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
  { id: 'ex_cable_crunch', name: 'Cable Crunch', muscleGroups: ['Core'], equipment: 'Cable', defaultReps: [10, 15], defaultRestSec: 60, builtin: true },
  // Chest
  { id: 'ex_flat_db_press', name: 'Flat Dumbbell Press', muscleGroups: ['Chest', 'Triceps', 'Shoulders'], equipment: 'Dumbbell', defaultReps: [8, 12], defaultRestSec: 120, builtin: true },
  { id: 'ex_decline_bench_press', name: 'Decline Bench Press', muscleGroups: ['Chest', 'Triceps'], equipment: 'Barbell', defaultReps: [8, 12], defaultRestSec: 120, builtin: true },
  { id: 'ex_pushup', name: 'Push-Up', muscleGroups: ['Chest', 'Triceps', 'Shoulders'], equipment: 'Bodyweight', defaultReps: [10, 20], defaultRestSec: 60, builtin: true },
  { id: 'ex_pec_deck', name: 'Pec Deck (Machine Fly)', muscleGroups: ['Chest'], equipment: 'Machine', defaultReps: [10, 15], defaultRestSec: 90, builtin: true },
  // Back
  { id: 'ex_tbar_row', name: 'T-Bar Row', muscleGroups: ['Back', 'Biceps'], equipment: 'Barbell', defaultReps: [8, 12], defaultRestSec: 120, builtin: true },
  { id: 'ex_single_arm_db_row', name: 'Single-Arm Dumbbell Row', muscleGroups: ['Back', 'Biceps'], equipment: 'Dumbbell', defaultReps: [8, 12], defaultRestSec: 90, builtin: true },
  { id: 'ex_chest_supported_row', name: 'Chest-Supported Row', muscleGroups: ['Back'], equipment: 'Machine', defaultReps: [10, 12], defaultRestSec: 90, builtin: true },
  { id: 'ex_straight_arm_pulldown', name: 'Straight-Arm Pulldown', muscleGroups: ['Back'], equipment: 'Cable', defaultReps: [10, 15], defaultRestSec: 60, builtin: true },
  // Shoulders
  { id: 'ex_arnold_press', name: 'Arnold Press', muscleGroups: ['Shoulders', 'Triceps'], equipment: 'Dumbbell', defaultReps: [8, 12], defaultRestSec: 120, builtin: true },
  { id: 'ex_front_raise', name: 'Front Raise', muscleGroups: ['Shoulders'], equipment: 'Dumbbell', defaultReps: [10, 15], defaultRestSec: 60, builtin: true },
  { id: 'ex_cable_lateral_raise', name: 'Cable Lateral Raise', muscleGroups: ['Shoulders'], equipment: 'Cable', defaultReps: [12, 15], defaultRestSec: 60, builtin: true },
  // Biceps
  { id: 'ex_bayesian_cable_curl', name: 'Bayesian Cable Curl', muscleGroups: ['Biceps'], equipment: 'Cable', defaultReps: [10, 15], defaultRestSec: 60, builtin: true },
  { id: 'ex_preacher_curl', name: 'Preacher Curl', muscleGroups: ['Biceps'], equipment: 'Barbell', defaultReps: [8, 12], defaultRestSec: 90, builtin: true },
  { id: 'ex_cable_curl', name: 'Cable Curl', muscleGroups: ['Biceps'], equipment: 'Cable', defaultReps: [10, 15], defaultRestSec: 60, builtin: true },
  { id: 'ex_concentration_curl', name: 'Concentration Curl', muscleGroups: ['Biceps'], equipment: 'Dumbbell', defaultReps: [10, 12], defaultRestSec: 60, builtin: true },
  // Triceps
  { id: 'ex_skull_crusher', name: 'Skull Crusher', muscleGroups: ['Triceps'], equipment: 'Barbell', defaultReps: [8, 12], defaultRestSec: 90, builtin: true },
  { id: 'ex_diamond_pushup', name: 'Diamond Push-Up', muscleGroups: ['Triceps', 'Chest'], equipment: 'Bodyweight', defaultReps: [10, 20], defaultRestSec: 60, builtin: true },
  { id: 'ex_cable_kickback', name: 'Cable Tricep Kickback', muscleGroups: ['Triceps'], equipment: 'Cable', defaultReps: [10, 15], defaultRestSec: 60, builtin: true },
  // Quads
  { id: 'ex_hack_squat', name: 'Hack Squat', muscleGroups: ['Quads', 'Glutes'], equipment: 'Machine', defaultReps: [8, 12], defaultRestSec: 150, builtin: true },
  { id: 'ex_goblet_squat', name: 'Goblet Squat', muscleGroups: ['Quads', 'Glutes'], equipment: 'Dumbbell', defaultReps: [10, 15], defaultRestSec: 90, builtin: true },
  { id: 'ex_walking_lunge', name: 'Walking Lunge', muscleGroups: ['Quads', 'Glutes'], equipment: 'Dumbbell', defaultReps: [10, 12], defaultRestSec: 90, builtin: true },
  // Hamstrings
  { id: 'ex_nordic_curl', name: 'Nordic Curl', muscleGroups: ['Hamstrings'], equipment: 'Bodyweight', defaultReps: [5, 10], defaultRestSec: 120, builtin: true },
  { id: 'ex_good_morning', name: 'Good Morning', muscleGroups: ['Hamstrings', 'Glutes'], equipment: 'Barbell', defaultReps: [8, 12], defaultRestSec: 120, builtin: true },
  // Glutes
  { id: 'ex_glute_bridge', name: 'Glute Bridge', muscleGroups: ['Glutes', 'Hamstrings'], equipment: 'Bodyweight', defaultReps: [12, 20], defaultRestSec: 60, builtin: true },
  { id: 'ex_cable_glute_kickback', name: 'Cable Glute Kickback', muscleGroups: ['Glutes'], equipment: 'Cable', defaultReps: [12, 15], defaultRestSec: 60, builtin: true },
  { id: 'ex_hip_abduction_machine', name: 'Hip Abduction Machine', muscleGroups: ['Glutes'], equipment: 'Machine', defaultReps: [12, 20], defaultRestSec: 60, builtin: true },
  // Calves
  { id: 'ex_donkey_calf_raise', name: 'Donkey Calf Raise', muscleGroups: ['Calves'], equipment: 'Machine', defaultReps: [12, 20], defaultRestSec: 60, builtin: true },
  // Core
  { id: 'ex_russian_twist', name: 'Russian Twist', muscleGroups: ['Core'], equipment: 'Bodyweight', defaultReps: [15, 20], defaultRestSec: 60, builtin: true },
  { id: 'ex_ab_wheel_rollout', name: 'Ab Wheel Rollout', muscleGroups: ['Core'], equipment: 'Other', defaultReps: [8, 12], defaultRestSec: 60, builtin: true },
  { id: 'ex_situp', name: 'Sit-Up', muscleGroups: ['Core'], equipment: 'Bodyweight', defaultReps: [15, 25], defaultRestSec: 45, builtin: true },
  { id: 'ex_mountain_climber', name: 'Mountain Climber', muscleGroups: ['Core'], equipment: 'Bodyweight', defaultReps: [20, 30], defaultRestSec: 45, builtin: true },
  // Traps
  { id: 'ex_barbell_shrug', name: 'Barbell Shrug', muscleGroups: ['Traps'], equipment: 'Barbell', defaultReps: [8, 12], defaultRestSec: 90, builtin: true },
  { id: 'ex_db_shrug', name: 'Dumbbell Shrug', muscleGroups: ['Traps'], equipment: 'Dumbbell', defaultReps: [10, 15], defaultRestSec: 90, builtin: true },
  // Forearms
  { id: 'ex_wrist_curl', name: 'Wrist Curl', muscleGroups: ['Forearms'], equipment: 'Barbell', defaultReps: [12, 20], defaultRestSec: 45, builtin: true },
  { id: 'ex_farmers_carry', name: "Farmer's Carry", muscleGroups: ['Forearms', 'Traps', 'Core'], equipment: 'Kettlebell', defaultReps: [20, 40], defaultRestSec: 90, builtin: true },
  // Full Body / Olympic
  { id: 'ex_kettlebell_swing', name: 'Kettlebell Swing', muscleGroups: ['Glutes', 'Hamstrings', 'Core'], equipment: 'Kettlebell', defaultReps: [12, 20], defaultRestSec: 60, builtin: true },
  { id: 'ex_clean_and_jerk', name: 'Clean and Jerk', muscleGroups: ['Quads', 'Shoulders', 'Back'], equipment: 'Barbell', defaultReps: [1, 5], defaultRestSec: 180, builtin: true },
  { id: 'ex_snatch', name: 'Snatch', muscleGroups: ['Shoulders', 'Back', 'Quads'], equipment: 'Barbell', defaultReps: [1, 5], defaultRestSec: 180, builtin: true },
  // Cardio / Conditioning
  { id: 'ex_battle_ropes', name: 'Battle Ropes', muscleGroups: ['Shoulders', 'Core'], equipment: 'Other', defaultReps: [20, 40], defaultRestSec: 60, builtin: true },
  { id: 'ex_box_jump', name: 'Box Jump', muscleGroups: ['Quads', 'Glutes', 'Calves'], equipment: 'Bodyweight', defaultReps: [8, 12], defaultRestSec: 90, builtin: true }
];

export const MUSCLE_GROUPS = ['Chest','Back','Shoulders','Biceps','Triceps','Quads','Hamstrings','Glutes','Calves','Core','Traps','Forearms'];
export const EQUIPMENT = ['Barbell','Dumbbell','Machine','Cable','Bodyweight','Kettlebell','Other'];
