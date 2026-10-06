// Seed library of common lifts. Users can add/edit/delete custom exercises.
// `id` values are stable and namespaced so backups/imports are portable.

// THE LIBRARY VERSION. Bump it whenever exercises are added, renamed, merged or
// given aliases.
//
// Reconciliation is gated on it: on launch, if LIBRARY_VERSION is greater than
// the `lastReconciledVersion` stored for this device, the user's custom
// exercises are compared against the library once and the version is recorded.
// Without the gate, every launch would re-walk every custom exercise and
// re-offer suggestions the user has already answered.
//
//   1  the original seed library
//   2  ~40 exercises added (the batch that made duplicate customs likely),
//      plus the `aliases` field and the reconciliation pass itself
//
// DELIBERATELY NOT BUMPED FOR `primary`/`secondary`. Those two fields were added
// to every builtin below for the anatomy figures (services/anatomy.js), and they
// add, rename and merge nothing — no exercise's identity, name or aliases
// changed, so a reconciliation pass would walk every custom exercise on every
// device and find exactly what it found last time. The fields are also read from
// this module rather than from the seeded database row, so they need no migration
// to take effect; see the long note on tiersFor().
export const LIBRARY_VERSION = 2;

export const DEFAULT_EXERCISES = [
  // Chest
  { id: 'ex_bench_press', name: 'Bench Press', muscleGroups: ['Chest', 'Triceps', 'Shoulders'], primary: ['Chest'], secondary: ['Triceps', 'Shoulders'], equipment: 'Barbell', defaultReps: [6, 10], defaultRestSec: 180, builtin: true },
  { id: 'ex_incline_db_press', name: 'Incline Dumbbell Press', muscleGroups: ['Chest', 'Shoulders'], primary: ['Chest'], secondary: ['Shoulders', 'Triceps'], equipment: 'Dumbbell', defaultReps: [8, 12], defaultRestSec: 120, builtin: true },
  { id: 'ex_dips', name: 'Dips', muscleGroups: ['Chest', 'Triceps'], primary: ['Chest', 'Triceps'], secondary: ['Shoulders'], equipment: 'Bodyweight', defaultReps: [6, 12], defaultRestSec: 120, builtin: true },
  { id: 'ex_cable_fly', name: 'Cable Fly', muscleGroups: ['Chest'], primary: ['Chest'], secondary: [], equipment: 'Cable', defaultReps: [10, 15], defaultRestSec: 90, builtin: true },
  // Back
  { id: 'ex_deadlift', name: 'Deadlift', muscleGroups: ['Back', 'Hamstrings', 'Glutes'], primary: ['Back', 'Hamstrings'], secondary: ['Glutes', 'Traps', 'Forearms', 'Core'], equipment: 'Barbell', defaultReps: [3, 6], defaultRestSec: 240, builtin: true },
  { id: 'ex_pullup', name: 'Pull-Up', muscleGroups: ['Back', 'Biceps'], primary: ['Back'], secondary: ['Biceps', 'Forearms'], equipment: 'Bodyweight', defaultReps: [5, 10], defaultRestSec: 150, builtin: true },
  { id: 'ex_barbell_row', name: 'Barbell Row', muscleGroups: ['Back', 'Biceps'], primary: ['Back'], secondary: ['Biceps', 'Traps', 'Forearms'], equipment: 'Barbell', defaultReps: [6, 10], defaultRestSec: 150, builtin: true },
  { id: 'ex_lat_pulldown', name: 'Lat Pulldown', muscleGroups: ['Back', 'Biceps'], primary: ['Back'], secondary: ['Biceps', 'Forearms'], equipment: 'Cable', defaultReps: [8, 12], defaultRestSec: 120, builtin: true },
  { id: 'ex_seated_row', name: 'Seated Cable Row', muscleGroups: ['Back'], primary: ['Back'], secondary: ['Biceps', 'Traps'], equipment: 'Cable', defaultReps: [8, 12], defaultRestSec: 120, builtin: true },
  // Shoulders
  { id: 'ex_ohp', name: 'Overhead Press', muscleGroups: ['Shoulders', 'Triceps'], primary: ['Shoulders'], secondary: ['Triceps', 'Traps', 'Core'], equipment: 'Barbell', defaultReps: [5, 8], defaultRestSec: 180, builtin: true },
  { id: 'ex_db_shoulder_press', name: 'Dumbbell Shoulder Press', muscleGroups: ['Shoulders'], primary: ['Shoulders'], secondary: ['Triceps', 'Traps'], equipment: 'Dumbbell', defaultReps: [8, 12], defaultRestSec: 120, builtin: true },
  { id: 'ex_lateral_raise', name: 'Lateral Raise', muscleGroups: ['Shoulders'], primary: ['Shoulders'], secondary: ['Traps'], equipment: 'Dumbbell', defaultReps: [10, 15], defaultRestSec: 60, builtin: true },
  { id: 'ex_rear_delt_fly', name: 'Rear Delt Fly', muscleGroups: ['Shoulders'], primary: ['Shoulders'], secondary: ['Back', 'Traps'], equipment: 'Dumbbell', defaultReps: [10, 15], defaultRestSec: 60, builtin: true },
  // Biceps
  { id: 'ex_barbell_curl', name: 'Barbell Curl', muscleGroups: ['Biceps'], primary: ['Biceps'], secondary: ['Forearms'], equipment: 'Barbell', defaultReps: [8, 12], defaultRestSec: 90, builtin: true },
  { id: 'ex_hammer_curl', name: 'Hammer Curl', muscleGroups: ['Biceps'], primary: ['Biceps'], secondary: ['Forearms'], equipment: 'Dumbbell', defaultReps: [10, 12], defaultRestSec: 90, builtin: true },
  { id: 'ex_incline_db_curl', name: 'Incline Dumbbell Curl', muscleGroups: ['Biceps'], primary: ['Biceps'], secondary: ['Forearms'], equipment: 'Dumbbell', defaultReps: [10, 12], defaultRestSec: 90, builtin: true },
  // Triceps
  { id: 'ex_close_grip_bench', name: 'Close-Grip Bench', muscleGroups: ['Triceps', 'Chest'], primary: ['Triceps'], secondary: ['Chest', 'Shoulders'], equipment: 'Barbell', defaultReps: [6, 10], defaultRestSec: 150, builtin: true },
  { id: 'ex_tricep_pushdown', name: 'Tricep Pushdown', muscleGroups: ['Triceps'], primary: ['Triceps'], secondary: [], equipment: 'Cable', defaultReps: [10, 15], defaultRestSec: 60, builtin: true },
  { id: 'ex_overhead_ext', name: 'Overhead Tricep Ext.', muscleGroups: ['Triceps'], primary: ['Triceps'], secondary: [], equipment: 'Cable', defaultReps: [10, 12], defaultRestSec: 90, builtin: true },
  // Quads
  { id: 'ex_squat', name: 'Back Squat', muscleGroups: ['Quads', 'Glutes'], primary: ['Quads', 'Glutes'], secondary: ['Core', 'Hamstrings'], equipment: 'Barbell', defaultReps: [5, 8], defaultRestSec: 210, builtin: true },
  { id: 'ex_front_squat', name: 'Front Squat', muscleGroups: ['Quads'], primary: ['Quads'], secondary: ['Core', 'Glutes'], equipment: 'Barbell', defaultReps: [5, 8], defaultRestSec: 180, builtin: true },
  { id: 'ex_leg_press', name: 'Leg Press', muscleGroups: ['Quads', 'Glutes'], primary: ['Quads'], secondary: ['Glutes'], equipment: 'Machine', defaultReps: [8, 12], defaultRestSec: 150, builtin: true },
  { id: 'ex_leg_extension', name: 'Leg Extension', muscleGroups: ['Quads'], primary: ['Quads'], secondary: [], equipment: 'Machine', defaultReps: [10, 15], defaultRestSec: 60, builtin: true },
  { id: 'ex_bulgarian_split', name: 'Bulgarian Split Squat', muscleGroups: ['Quads', 'Glutes'], primary: ['Quads', 'Glutes'], secondary: ['Core'], equipment: 'Dumbbell', defaultReps: [8, 12], defaultRestSec: 120, builtin: true },
  // Hamstrings
  { id: 'ex_rdl', name: 'Romanian Deadlift', muscleGroups: ['Hamstrings', 'Glutes'], primary: ['Hamstrings', 'Glutes'], secondary: ['Back', 'Forearms'], equipment: 'Barbell', defaultReps: [6, 10], defaultRestSec: 150, builtin: true },
  { id: 'ex_leg_curl', name: 'Leg Curl', muscleGroups: ['Hamstrings'], primary: ['Hamstrings'], secondary: ['Calves'], equipment: 'Machine', defaultReps: [10, 15], defaultRestSec: 90, builtin: true },
  // Glutes
  { id: 'ex_hip_thrust', name: 'Hip Thrust', muscleGroups: ['Glutes', 'Hamstrings'], primary: ['Glutes'], secondary: ['Hamstrings'], equipment: 'Barbell', defaultReps: [8, 12], defaultRestSec: 120, builtin: true },
  // Calves
  { id: 'ex_standing_calf', name: 'Standing Calf Raise', muscleGroups: ['Calves'], primary: ['Calves'], secondary: [], equipment: 'Machine', defaultReps: [10, 15], defaultRestSec: 60, builtin: true },
  { id: 'ex_seated_calf', name: 'Seated Calf Raise', muscleGroups: ['Calves'], primary: ['Calves'], secondary: [], equipment: 'Machine', defaultReps: [12, 20], defaultRestSec: 60, builtin: true },
  // Core
  { id: 'ex_plank', name: 'Plank', muscleGroups: ['Core'], primary: ['Core'], secondary: ['Shoulders'], equipment: 'Bodyweight', defaultReps: [30, 60], defaultRestSec: 60, builtin: true },
  { id: 'ex_hanging_leg_raise', name: 'Hanging Leg Raise', muscleGroups: ['Core'], primary: ['Core'], secondary: ['Forearms'], equipment: 'Bodyweight', defaultReps: [8, 15], defaultRestSec: 60, builtin: true },
  { id: 'ex_cable_crunch', name: 'Cable Crunch', muscleGroups: ['Core'], primary: ['Core'], secondary: [], equipment: 'Cable', defaultReps: [10, 15], defaultRestSec: 60, builtin: true },
  // Chest
  { id: 'ex_flat_db_press', name: 'Flat Dumbbell Press', muscleGroups: ['Chest', 'Triceps', 'Shoulders'], primary: ['Chest'], secondary: ['Triceps', 'Shoulders'], equipment: 'Dumbbell', defaultReps: [8, 12], defaultRestSec: 120, builtin: true },
  { id: 'ex_decline_bench_press', name: 'Decline Bench Press', muscleGroups: ['Chest', 'Triceps'], primary: ['Chest'], secondary: ['Triceps', 'Shoulders'], equipment: 'Barbell', defaultReps: [8, 12], defaultRestSec: 120, builtin: true },
  { id: 'ex_pushup', name: 'Push-Up', muscleGroups: ['Chest', 'Triceps', 'Shoulders'], primary: ['Chest'], secondary: ['Triceps', 'Shoulders', 'Core'], equipment: 'Bodyweight', defaultReps: [10, 20], defaultRestSec: 60, builtin: true },
  { id: 'ex_pec_deck', name: 'Pec Deck (Machine Fly)', muscleGroups: ['Chest'], primary: ['Chest'], secondary: [], equipment: 'Machine', defaultReps: [10, 15], defaultRestSec: 90, builtin: true },
  // Back
  { id: 'ex_tbar_row', name: 'T-Bar Row', muscleGroups: ['Back', 'Biceps'], primary: ['Back'], secondary: ['Biceps', 'Traps'], equipment: 'Barbell', defaultReps: [8, 12], defaultRestSec: 120, builtin: true },
  { id: 'ex_single_arm_db_row', name: 'Single-Arm Dumbbell Row', muscleGroups: ['Back', 'Biceps'], primary: ['Back'], secondary: ['Biceps', 'Traps'], equipment: 'Dumbbell', defaultReps: [8, 12], defaultRestSec: 90, builtin: true },
  { id: 'ex_chest_supported_row', name: 'Chest-Supported Row', muscleGroups: ['Back'], primary: ['Back'], secondary: ['Biceps', 'Traps'], equipment: 'Machine', defaultReps: [10, 12], defaultRestSec: 90, builtin: true },
  { id: 'ex_straight_arm_pulldown', name: 'Straight-Arm Pulldown', muscleGroups: ['Back'], primary: ['Back'], secondary: ['Core'], equipment: 'Cable', defaultReps: [10, 15], defaultRestSec: 60, builtin: true },
  // Shoulders
  { id: 'ex_arnold_press', name: 'Arnold Press', muscleGroups: ['Shoulders', 'Triceps'], primary: ['Shoulders'], secondary: ['Triceps', 'Traps'], equipment: 'Dumbbell', defaultReps: [8, 12], defaultRestSec: 120, builtin: true },
  { id: 'ex_front_raise', name: 'Front Raise', muscleGroups: ['Shoulders'], primary: ['Shoulders'], secondary: [], equipment: 'Dumbbell', defaultReps: [10, 15], defaultRestSec: 60, builtin: true },
  { id: 'ex_cable_lateral_raise', name: 'Cable Lateral Raise', muscleGroups: ['Shoulders'], primary: ['Shoulders'], secondary: ['Traps'], equipment: 'Cable', defaultReps: [12, 15], defaultRestSec: 60, builtin: true },
  // Biceps
  { id: 'ex_bayesian_cable_curl', name: 'Bayesian Cable Curl', muscleGroups: ['Biceps'], primary: ['Biceps'], secondary: ['Forearms'], equipment: 'Cable', defaultReps: [10, 15], defaultRestSec: 60, builtin: true },
  { id: 'ex_preacher_curl', name: 'Preacher Curl', muscleGroups: ['Biceps'], primary: ['Biceps'], secondary: ['Forearms'], equipment: 'Barbell', defaultReps: [8, 12], defaultRestSec: 90, builtin: true },
  { id: 'ex_cable_curl', name: 'Cable Curl', muscleGroups: ['Biceps'], primary: ['Biceps'], secondary: ['Forearms'], equipment: 'Cable', defaultReps: [10, 15], defaultRestSec: 60, builtin: true },
  { id: 'ex_concentration_curl', name: 'Concentration Curl', muscleGroups: ['Biceps'], primary: ['Biceps'], secondary: ['Forearms'], equipment: 'Dumbbell', defaultReps: [10, 12], defaultRestSec: 60, builtin: true },
  // Triceps
  { id: 'ex_skull_crusher', name: 'Skull Crusher', muscleGroups: ['Triceps'], primary: ['Triceps'], secondary: [], equipment: 'Barbell', defaultReps: [8, 12], defaultRestSec: 90, builtin: true },
  { id: 'ex_diamond_pushup', name: 'Diamond Push-Up', muscleGroups: ['Triceps', 'Chest'], primary: ['Triceps'], secondary: ['Chest', 'Shoulders'], equipment: 'Bodyweight', defaultReps: [10, 20], defaultRestSec: 60, builtin: true },
  { id: 'ex_cable_kickback', name: 'Cable Tricep Kickback', muscleGroups: ['Triceps'], primary: ['Triceps'], secondary: [], equipment: 'Cable', defaultReps: [10, 15], defaultRestSec: 60, builtin: true },
  // Quads
  { id: 'ex_hack_squat', name: 'Hack Squat', muscleGroups: ['Quads', 'Glutes'], primary: ['Quads'], secondary: ['Glutes'], equipment: 'Machine', defaultReps: [8, 12], defaultRestSec: 150, builtin: true },
  { id: 'ex_goblet_squat', name: 'Goblet Squat', muscleGroups: ['Quads', 'Glutes'], primary: ['Quads'], secondary: ['Glutes', 'Core'], equipment: 'Dumbbell', defaultReps: [10, 15], defaultRestSec: 90, builtin: true },
  { id: 'ex_walking_lunge', name: 'Walking Lunge', muscleGroups: ['Quads', 'Glutes'], primary: ['Quads', 'Glutes'], secondary: ['Core'], equipment: 'Dumbbell', defaultReps: [10, 12], defaultRestSec: 90, builtin: true },
  // Hamstrings
  { id: 'ex_nordic_curl', name: 'Nordic Curl', muscleGroups: ['Hamstrings'], primary: ['Hamstrings'], secondary: [], equipment: 'Bodyweight', defaultReps: [5, 10], defaultRestSec: 120, builtin: true },
  { id: 'ex_good_morning', name: 'Good Morning', muscleGroups: ['Hamstrings', 'Glutes'], primary: ['Hamstrings'], secondary: ['Glutes', 'Back'], equipment: 'Barbell', defaultReps: [8, 12], defaultRestSec: 120, builtin: true },
  // Glutes
  { id: 'ex_glute_bridge', name: 'Glute Bridge', muscleGroups: ['Glutes', 'Hamstrings'], primary: ['Glutes'], secondary: ['Hamstrings'], equipment: 'Bodyweight', defaultReps: [12, 20], defaultRestSec: 60, builtin: true },
  { id: 'ex_cable_glute_kickback', name: 'Cable Glute Kickback', muscleGroups: ['Glutes'], primary: ['Glutes'], secondary: [], equipment: 'Cable', defaultReps: [12, 15], defaultRestSec: 60, builtin: true },
  { id: 'ex_hip_abduction_machine', name: 'Hip Abduction Machine', muscleGroups: ['Glutes'], primary: ['Glutes'], secondary: [], equipment: 'Machine', defaultReps: [12, 20], defaultRestSec: 60, builtin: true },
  // Calves
  { id: 'ex_donkey_calf_raise', name: 'Donkey Calf Raise', muscleGroups: ['Calves'], primary: ['Calves'], secondary: [], equipment: 'Machine', defaultReps: [12, 20], defaultRestSec: 60, builtin: true },
  // Core
  { id: 'ex_russian_twist', name: 'Russian Twist', muscleGroups: ['Core'], primary: ['Core'], secondary: [], equipment: 'Bodyweight', defaultReps: [15, 20], defaultRestSec: 60, builtin: true },
  { id: 'ex_ab_wheel_rollout', name: 'Ab Wheel Rollout', muscleGroups: ['Core'], primary: ['Core'], secondary: ['Shoulders'], equipment: 'Other', defaultReps: [8, 12], defaultRestSec: 60, builtin: true },
  { id: 'ex_situp', name: 'Sit-Up', muscleGroups: ['Core'], primary: ['Core'], secondary: [], equipment: 'Bodyweight', defaultReps: [15, 25], defaultRestSec: 45, builtin: true },
  { id: 'ex_mountain_climber', name: 'Mountain Climber', muscleGroups: ['Core'], primary: ['Core'], secondary: ['Shoulders', 'Quads'], equipment: 'Bodyweight', defaultReps: [20, 30], defaultRestSec: 45, builtin: true },
  // Traps
  { id: 'ex_barbell_shrug', name: 'Barbell Shrug', muscleGroups: ['Traps'], primary: ['Traps'], secondary: ['Forearms'], equipment: 'Barbell', defaultReps: [8, 12], defaultRestSec: 90, builtin: true },
  { id: 'ex_db_shrug', name: 'Dumbbell Shrug', muscleGroups: ['Traps'], primary: ['Traps'], secondary: ['Forearms'], equipment: 'Dumbbell', defaultReps: [10, 15], defaultRestSec: 90, builtin: true },
  // Forearms
  { id: 'ex_wrist_curl', name: 'Wrist Curl', muscleGroups: ['Forearms'], primary: ['Forearms'], secondary: [], equipment: 'Barbell', defaultReps: [12, 20], defaultRestSec: 45, builtin: true },
  { id: 'ex_farmers_carry', name: "Farmer's Carry", muscleGroups: ['Forearms', 'Traps', 'Core'], primary: ['Forearms'], secondary: ['Traps', 'Core'], equipment: 'Kettlebell', defaultReps: [20, 40], defaultRestSec: 90, builtin: true },
  // Full Body / Olympic
  { id: 'ex_kettlebell_swing', name: 'Kettlebell Swing', muscleGroups: ['Glutes', 'Hamstrings', 'Core'], primary: ['Glutes', 'Hamstrings'], secondary: ['Core', 'Back', 'Shoulders'], equipment: 'Kettlebell', defaultReps: [12, 20], defaultRestSec: 60, builtin: true },
  { id: 'ex_clean_and_jerk', name: 'Clean and Jerk', muscleGroups: ['Quads', 'Shoulders', 'Back'], primary: ['Quads', 'Shoulders'], secondary: ['Back', 'Traps', 'Glutes', 'Core'], equipment: 'Barbell', defaultReps: [1, 5], defaultRestSec: 180, builtin: true },
  { id: 'ex_snatch', name: 'Snatch', muscleGroups: ['Shoulders', 'Back', 'Quads'], primary: ['Shoulders', 'Back'], secondary: ['Quads', 'Traps', 'Glutes', 'Core'], equipment: 'Barbell', defaultReps: [1, 5], defaultRestSec: 180, builtin: true },
  // Cardio / Conditioning
  { id: 'ex_battle_ropes', name: 'Battle Ropes', muscleGroups: ['Shoulders', 'Core'], primary: ['Shoulders'], secondary: ['Core', 'Forearms'], equipment: 'Other', defaultReps: [20, 40], defaultRestSec: 60, builtin: true },
  { id: 'ex_box_jump', name: 'Box Jump', muscleGroups: ['Quads', 'Glutes', 'Calves'], primary: ['Quads', 'Glutes'], secondary: ['Calves', 'Core'], equipment: 'Bodyweight', defaultReps: [8, 12], defaultRestSec: 90, builtin: true }
];

export const MUSCLE_GROUPS = ['Chest','Back','Shoulders','Biceps','Triceps','Quads','Hamstrings','Glutes','Calves','Core','Traps','Forearms'];
export const EQUIPMENT = ['Barbell','Dumbbell','Machine','Cable','Bodyweight','Kettlebell','Other'];
