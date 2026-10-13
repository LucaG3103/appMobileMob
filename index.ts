// Register the background task before anything else: when the OS wakes the
// app for a location update no screen is mounted, only this entry runs.
import './src/services/tripTracker';
import 'expo-router/entry';
