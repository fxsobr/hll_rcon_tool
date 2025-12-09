import { withJsonFormsControlProps } from "@jsonforms/react";
import {
  Box,
  Button,
  FormControl,
  FormHelperText,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { rankWith, scopeEndsWith } from "@jsonforms/core";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import { useState } from "react";


const AVAILABLE_ROLES = [
  { value: "armycommander", label: "Commander" },
  { value: "officer", label: "Squad Lead" },
  { value: "rifleman", label: "Rifleman" },
  { value: "assault", label: "Assault" },
  { value: "automaticrifleman", label: "Automatic Rifleman" },
  { value: "medic", label: "Medic" },
  { value: "support", label: "Support" },
  { value: "heavymachinegunner", label: "Machinegunner" },
  { value: "antitank", label: "Anti-Tank" },
  { value: "engineer", label: "Engineer" },
  { value: "tankcommander", label: "Tank Commander" },
  { value: "crewman", label: "Crewman" },
  { value: "spotter", label: "Spotter" },
  { value: "sniper", label: "Sniper" },
  { value: "artilleryobserver", label: "Artillery Observer" },
  { value: "artilleryengineer", label: "Artillery Engineer" },
  { value: "artillerysupport", label: "Artillery Support" },
];

const LevelThresholdsRenderer = (props) => {
  const { data, handleChange, path, label, description, errors } = props;
  const [selectedRole, setSelectedRole] = useState("");

  const thresholds = data || {};
  const configuredRoles = Object.keys(thresholds);
  const availableRolesToAdd = AVAILABLE_ROLES.filter(
    (role) => !configuredRoles.includes(role.value)
  );

  const handleAddRole = () => {
    if (!selectedRole) return;

    const newThresholds = {
      ...thresholds,
      [selectedRole]: {
        label: AVAILABLE_ROLES.find((r) => r.value === selectedRole)?.label || selectedRole,
        min_players: 0,
        min_level: 0,
      },
    };

    handleChange(path, newThresholds);
    setSelectedRole("");
  };

  const handleRemoveRole = (roleKey) => {
    const newThresholds = { ...thresholds };
    delete newThresholds[roleKey];
    handleChange(path, newThresholds);
  };

  const handleUpdateRole = (roleKey, field, value) => {
    const newThresholds = {
      ...thresholds,
      [roleKey]: {
        ...thresholds[roleKey],
        [field]: field === "label" ? value : parseInt(value, 10) || 0,
      },
    };
    handleChange(path, newThresholds);
  };

  return (
    <FormControl fullWidth margin="normal" error={errors && errors.length > 0}>
      <InputLabel shrink sx={{ position: "relative", transform: "none", mb: 1 }}>
        {label || "Role Level Thresholds"}
      </InputLabel>
      {description && (
        <FormHelperText sx={{ mt: 0, mb: 2 }}>{description}</FormHelperText>
      )}

      <Stack spacing={2}>
        {configuredRoles.length > 0 ? (
          configuredRoles.map((roleKey) => {
            const roleConfig = thresholds[roleKey];
            const roleLabel = AVAILABLE_ROLES.find((r) => r.value === roleKey)?.label || roleKey;

            return (
              <Paper key={roleKey} elevation={1} sx={{ p: 2 }}>
                <Stack spacing={2}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="subtitle1" fontWeight="bold">
                      {roleLabel}
                    </Typography>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => handleRemoveRole(roleKey)}
                      aria-label={`Remove ${roleLabel}`}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Stack>

                  <TextField
                    fullWidth
                    label="Label (Display Name)"
                    value={roleConfig.label || ""}
                    onChange={(e) => handleUpdateRole(roleKey, "label", e.target.value)}
                    size="small"
                  />

                  <TextField
                    fullWidth
                    type="number"
                    label="Minimum Players"
                    value={roleConfig.min_players ?? 0}
                    onChange={(e) => handleUpdateRole(roleKey, "min_players", e.target.value)}
                    inputProps={{ min: 0, max: 100 }}
                    size="small"
                    helperText="Minimum number of players on the server for this threshold to apply"
                  />

                  <TextField
                    fullWidth
                    type="number"
                    label="Minimum Level"
                    value={roleConfig.min_level ?? 0}
                    onChange={(e) => handleUpdateRole(roleKey, "min_level", e.target.value)}
                    inputProps={{ min: 0, max: 500 }}
                    size="small"
                    helperText="Minimum level required to play this role"
                  />
                </Stack>
              </Paper>
            );
          })
        ) : (
          <Box sx={{ p: 2, textAlign: "center", color: "text.secondary" }}>
            <Typography variant="body2">
              No role thresholds configured. Add a role below to get started.
            </Typography>
          </Box>
        )}

        {availableRolesToAdd.length > 0 && (
          <Paper elevation={0} sx={{ p: 2, bgcolor: "action.hover" }}>
            <Stack direction="row" spacing={2} alignItems="center">
              <FormControl fullWidth size="small">
                <InputLabel>Add Role</InputLabel>
                <Select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  label="Add Role"
                >
                  {availableRolesToAdd.map((role) => (
                    <MenuItem key={role.value} value={role.value}>
                      {role.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={handleAddRole}
                disabled={!selectedRole}
              >
                Add
              </Button>
            </Stack>
          </Paper>
        )}
      </Stack>

      {errors && errors.length > 0 && (
        <FormHelperText error>{errors}</FormHelperText>
      )}
    </FormControl>
  );
};

export const levelThresholdsTester = rankWith(
  10,
  scopeEndsWith("level_thresholds")
);

export const renderer = withJsonFormsControlProps(LevelThresholdsRenderer);

