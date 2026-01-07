import { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stack,
  Box,
  Typography,
  IconButton,
  Paper,
  Divider,
  FormControlLabel,
  Switch,
  RadioGroup,
  Radio,
  FormLabel,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import ConditionBuilder from "./ConditionBuilder";
import ActionBuilder from "./ActionBuilder";

const TRIGGER_EVENTS = [
  { value: "player_connected", label: "Player Connected" },
  { value: "player_disconnected", label: "Player Disconnected" },
  { value: "player_kill", label: "Player Kill" },
  { value: "player_death", label: "Player Death" },
  { value: "player_team_kill", label: "Player Team Kill" },
  { value: "match_start", label: "Match Start" },
  { value: "match_end", label: "Match End" },
  { value: "player_chat", label: "Player Chat" },
  { value: "player_team_switch", label: "Player Team Switch" },
];

const LOGICAL_OPERATORS = [
  { value: "and", label: "AND - All conditions must be met" },
  { value: "or", label: "OR - Any condition must be met" },
  { value: "nand", label: "NAND - Not all conditions are met" },
  { value: "nor", label: "NOR - None of the conditions are met" },
];

const RuleDialog = ({ open, rule, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    id: null,
    name: "",
    description: "",
    enabled: true,
    trigger_event: "player_connected",
    logical_operator: "and",
    conditions: [],
    actions: [],
    cooldown_seconds: 0,
    max_executions_per_player: 0,
  });

  useEffect(() => {
    if (rule) {
      setFormData(rule);
    } else {
      setFormData({
        id: null,
        name: "",
        description: "",
        enabled: true,
        trigger_event: "player_connected",
        logical_operator: "and",
        conditions: [],
        actions: [],
        cooldown_seconds: 0,
        max_executions_per_player: 0,
      });
    }
  }, [rule, open]);

  const handleChange = (field) => (event) => {
    setFormData({ ...formData, [field]: event.target.value });
  };

  const handleSwitchChange = (field) => (event) => {
    setFormData({ ...formData, [field]: event.target.checked });
  };

  const handleAddCondition = () => {
    setFormData({
      ...formData,
      conditions: [
        ...formData.conditions,
        {
          field: "player_name",
          operator: "equal",
          value: "",
        },
      ],
    });
  };

  const handleUpdateCondition = (index, condition) => {
    const newConditions = [...formData.conditions];
    newConditions[index] = condition;
    setFormData({ ...formData, conditions: newConditions });
  };

  const handleDeleteCondition = (index) => {
    const newConditions = [...formData.conditions];
    newConditions.splice(index, 1);
    setFormData({ ...formData, conditions: newConditions });
  };

  const handleAddAction = () => {
    setFormData({
      ...formData,
      actions: [
        ...formData.actions,
        {
          action_type: "message_player",
          parameters: { message: "" },
        },
      ],
    });
  };

  const handleUpdateAction = (index, action) => {
    const newActions = [...formData.actions];
    newActions[index] = action;
    setFormData({ ...formData, actions: newActions });
  };

  const handleDeleteAction = (index) => {
    const newActions = [...formData.actions];
    newActions.splice(index, 1);
    setFormData({ ...formData, actions: newActions });
  };

  const handleSave = () => {
    if (!formData.name.trim()) {
      alert("Please enter a rule name");
      return;
    }
    if (formData.conditions.length === 0) {
      alert("Please add at least one condition");
      return;
    }
    if (formData.actions.length === 0) {
      alert("Please add at least one action");
      return;
    }

    // Generate ID if it doesn't exist (new rule)
    const ruleToSave = {
      ...formData,
      id: formData.id || `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };

    onSave(ruleToSave);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>{rule ? "Edit Rule" : "Create New Rule"}</DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ mt: 1 }}>
          {/* Basic Info */}
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Basic Information
            </Typography>
            <Stack spacing={2}>
              <TextField
                label="Rule Name"
                value={formData.name}
                onChange={handleChange("name")}
                fullWidth
                required
              />
              <TextField
                label="Description"
                value={formData.description}
                onChange={handleChange("description")}
                fullWidth
                multiline
                rows={2}
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.enabled}
                    onChange={handleSwitchChange("enabled")}
                  />
                }
                label="Enabled"
              />
            </Stack>
          </Paper>

          {/* Trigger Event */}
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Trigger Event
            </Typography>
            <FormControl fullWidth>
              <InputLabel>When should this rule be evaluated?</InputLabel>
              <Select
                value={formData.trigger_event}
                onChange={handleChange("trigger_event")}
                label="When should this rule be evaluated?"
              >
                {TRIGGER_EVENTS.map((event) => (
                  <MenuItem key={event.value} value={event.value}>
                    {event.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Paper>

          {/* Conditions */}
          <Paper sx={{ p: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="h6">Conditions</Typography>
              <Button startIcon={<AddIcon />} onClick={handleAddCondition} size="small">
                Add Condition
              </Button>
            </Stack>

            {formData.conditions.length > 0 && (
              <FormControl component="fieldset" sx={{ mb: 2 }}>
                <FormLabel component="legend">Logical Operator</FormLabel>
                <RadioGroup
                  row
                  value={formData.logical_operator}
                  onChange={handleChange("logical_operator")}
                >
                  {LOGICAL_OPERATORS.map((op) => (
                    <FormControlLabel
                      key={op.value}
                      value={op.value}
                      control={<Radio />}
                      label={op.label}
                    />
                  ))}
                </RadioGroup>
              </FormControl>
            )}

            <Stack spacing={2}>
              {formData.conditions.map((condition, index) => (
                <Box key={index}>
                  <ConditionBuilder
                    condition={condition}
                    onChange={(newCondition) => handleUpdateCondition(index, newCondition)}
                    onDelete={() => handleDeleteCondition(index)}
                  />
                </Box>
              ))}
              {formData.conditions.length === 0 && (
                <Typography color="text.secondary" align="center">
                  No conditions added. Click "Add Condition" to create one.
                </Typography>
              )}
            </Stack>
          </Paper>

          {/* Actions */}
          <Paper sx={{ p: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="h6">Actions</Typography>
              <Button startIcon={<AddIcon />} onClick={handleAddAction} size="small">
                Add Action
              </Button>
            </Stack>
            <Stack spacing={2}>
              {formData.actions.map((action, index) => (
                <Box key={index}>
                  <ActionBuilder
                    action={action}
                    onChange={(newAction) => handleUpdateAction(index, newAction)}
                    onDelete={() => handleDeleteAction(index)}
                  />
                </Box>
              ))}
              {formData.actions.length === 0 && (
                <Typography color="text.secondary" align="center">
                  No actions added. Click "Add Action" to create one.
                </Typography>
              )}
            </Stack>
          </Paper>

          {/* Advanced Settings */}
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Advanced Settings
            </Typography>
            <Stack spacing={2}>
              <TextField
                label="Cooldown (seconds)"
                type="number"
                value={formData.cooldown_seconds}
                onChange={handleChange("cooldown_seconds")}
                fullWidth
                helperText="Minimum time between executions for the same player (0 = no cooldown)"
              />
              <TextField
                label="Max Executions Per Player"
                type="number"
                value={formData.max_executions_per_player}
                onChange={handleChange("max_executions_per_player")}
                fullWidth
                helperText="Maximum times this rule can execute for a player (0 = unlimited)"
              />
            </Stack>
          </Paper>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained">
          Save Rule
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default RuleDialog;

