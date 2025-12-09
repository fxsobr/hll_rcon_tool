import { withJsonFormsControlProps } from "@jsonforms/react";
import {
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Divider,
  FormControl,
  FormHelperText,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { rankWith, scopeEndsWith } from "@jsonforms/core";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
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
      <Box sx={{ mb: 3 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="h6" fontWeight="600">
            {label || "Role Level Thresholds"}
          </Typography>
          <Tooltip title="Configure minimum level requirements for specific roles based on server population">
            <InfoOutlinedIcon fontSize="small" color="action" />
          </Tooltip>
        </Stack>
        {description && (
          <Typography variant="body2" color="text.secondary">
            {description}
          </Typography>
        )}
      </Box>

      <Stack spacing={2.5}>
        {configuredRoles.length > 0 ? (
          <Grid container spacing={2}>
            {configuredRoles.map((roleKey) => {
              const roleConfig = thresholds[roleKey];
              const roleLabel = AVAILABLE_ROLES.find((r) => r.value === roleKey)?.label || roleKey;

              return (
                <Grid item xs={12} md={6} key={roleKey}>
                  <Card
                    elevation={2}
                    sx={{
                      height: '100%',
                      transition: 'all 0.2s',
                      '&:hover': {
                        elevation: 4,
                        transform: 'translateY(-2px)',
                      }
                    }}
                  >
                    <CardHeader
                      title={
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Typography variant="subtitle1" fontWeight="600">
                            {roleLabel}
                          </Typography>
                          <Chip
                            label={roleKey}
                            size="small"
                            variant="outlined"
                            sx={{ fontSize: '0.7rem', height: 20 }}
                          />
                        </Stack>
                      }
                      action={
                        <Tooltip title="Remove role threshold">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleRemoveRole(roleKey)}
                            aria-label={`Remove ${roleLabel}`}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      }
                      sx={{ pb: 1 }}
                    />
                    <Divider />
                    <CardContent>
                      <Stack spacing={2.5}>
                        <TextField
                          fullWidth
                          label="Display Label"
                          value={roleConfig.label || ""}
                          onChange={(e) => handleUpdateRole(roleKey, "label", e.target.value)}
                          size="small"
                          variant="outlined"
                        />

                        <Box>
                          <TextField
                            fullWidth
                            type="number"
                            label="Minimum Players"
                            value={roleConfig.min_players ?? 0}
                            onChange={(e) => handleUpdateRole(roleKey, "min_players", e.target.value)}
                            inputProps={{ min: 0, max: 100 }}
                            size="small"
                          />
                          <FormHelperText>
                            Minimum server population for this threshold to apply
                          </FormHelperText>
                        </Box>

                        <Box>
                          <TextField
                            fullWidth
                            type="number"
                            label="Minimum Level"
                            value={roleConfig.min_level ?? 0}
                            onChange={(e) => handleUpdateRole(roleKey, "min_level", e.target.value)}
                            inputProps={{ min: 0, max: 500 }}
                            size="small"
                          />
                          <FormHelperText>
                            Required player level to use this role
                          </FormHelperText>
                        </Box>
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        ) : (
          <Paper
            elevation={0}
            sx={{
              p: 4,
              textAlign: "center",
              bgcolor: "action.hover",
              borderRadius: 2,
              border: '2px dashed',
              borderColor: 'divider'
            }}
          >
            <Typography variant="body1" color="text.secondary" fontWeight="500">
              No role thresholds configured
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Add a role below to set level requirements
            </Typography>
          </Paper>
        )}

        {availableRolesToAdd.length > 0 && (
          <Paper
            elevation={0}
            sx={{
              p: 2.5,
              bgcolor: "primary.50",
              border: '1px solid',
              borderColor: 'primary.200',
              borderRadius: 2
            }}
          >
            <Stack spacing={2}>
              <Typography variant="subtitle2" fontWeight="600" color="primary.main">
                Add New Role Threshold
              </Typography>
              <Stack direction="row" spacing={2} alignItems="flex-start">
                <FormControl fullWidth size="small">
                  <InputLabel>Select Role</InputLabel>
                  <Select
                    value={selectedRole}
                    onChange={(e) => setSelectedRole(e.target.value)}
                    label="Select Role"
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
                  sx={{ minWidth: 100, height: 40 }}
                >
                  Add
                </Button>
              </Stack>
            </Stack>
          </Paper>
        )}
      </Stack>

      {errors && errors.length > 0 && (
        <FormHelperText error sx={{ mt: 2 }}>{errors}</FormHelperText>
      )}
    </FormControl>
  );
};

export const levelThresholdsTester = rankWith(
  10,
  scopeEndsWith("level_thresholds")
);

export const renderer = withJsonFormsControlProps(LevelThresholdsRenderer);

