import {
  Paper,
  Stack,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  IconButton,
  Typography,
  Box,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";

const ACTION_TYPES = [
  {
    value: "MESSAGE_PLAYER",
    label: "Message Player",
    params: [{ name: "message", label: "Message", type: "text", required: true }],
  },
  {
    value: "MESSAGE_ALL_PLAYERS",
    label: "Message All Players",
    params: [{ name: "message", label: "Message", type: "text", required: true }],
  },
  {
    value: "KICK_PLAYER",
    label: "Kick Player",
    params: [{ name: "reason", label: "Reason", type: "text", required: true }],
  },
  {
    value: "PUNISH_PLAYER",
    label: "Punish Player",
    params: [{ name: "reason", label: "Reason", type: "text", required: true }],
  },
  {
    value: "TEMP_BAN_PLAYER",
    label: "Temporary Ban Player",
    params: [
      { name: "reason", label: "Reason", type: "text", required: true },
      { name: "duration_hours", label: "Duration (hours)", type: "number", required: true, default: 2 },
    ],
  },
  {
    value: "PERMA_BAN_PLAYER",
    label: "Permanent Ban Player",
    params: [{ name: "reason", label: "Reason", type: "text", required: true }],
  },
  {
    value: "ADD_PLAYER_FLAG",
    label: "Add Player Flag",
    params: [
      { name: "flag", label: "Flag", type: "text", required: true },
      { name: "comment", label: "Comment", type: "text", required: false },
    ],
  },
  {
    value: "REMOVE_PLAYER_FLAG",
    label: "Remove Player Flag",
    params: [{ name: "flag", label: "Flag", type: "text", required: true }],
  },
  {
    value: "ADD_TO_WATCHLIST",
    label: "Add to Watchlist",
    params: [{ name: "reason", label: "Reason", type: "text", required: true }],
  },
  {
    value: "BROADCAST_MESSAGE",
    label: "Set Broadcast Message",
    params: [{ name: "message", label: "Message", type: "text", required: true }],
  },
  {
    value: "TEMPORARY_BROADCAST",
    label: "Temporary Broadcast",
    params: [
      { name: "message", label: "Message", type: "text", required: true },
      { name: "duration_seconds", label: "Duration (seconds)", type: "number", required: true, default: 60 },
    ],
  },
  {
    value: "SEND_DISCORD_WEBHOOK",
    label: "Send Discord Webhook",
    params: [
      { name: "webhook_url", label: "Webhook URL", type: "text", required: true },
      { name: "message", label: "Message", type: "text", required: true },
    ],
  },
  {
    value: "SWITCH_PLAYER_TEAM",
    label: "Switch Player Team",
    params: [],
  },
];

const ActionBuilder = ({ action, onChange, onDelete }) => {
  const selectedActionType = ACTION_TYPES.find((a) => a.value === action.action_type);
  const params = selectedActionType?.params || [];

  const handleActionTypeChange = (event) => {
    const newActionType = event.target.value;
    const newActionDef = ACTION_TYPES.find((a) => a.value === newActionType);
    
    const newParameters = {};
    newActionDef?.params.forEach((param) => {
      if (param.type === "number") {
        newParameters[param.name] = param.default || 0;
      } else {
        newParameters[param.name] = "";
      }
    });

    onChange({
      action_type: newActionType,
      parameters: newParameters,
    });
  };

  const handleParameterChange = (paramName) => (event) => {
    const value = event.target.type === "number" 
      ? parseFloat(event.target.value) || 0 
      : event.target.value;

    onChange({
      ...action,
      parameters: {
        ...action.parameters,
        [paramName]: value,
      },
    });
  };

  return (
    <Paper variant="outlined" sx={{ p: 2, bgcolor: "action.hover" }}>
      <Stack spacing={2}>
        <Stack direction="row" spacing={2} alignItems="flex-start">
          <FormControl sx={{ minWidth: 250 }}>
            <InputLabel>Action Type</InputLabel>
            <Select
              value={action.action_type}
              onChange={handleActionTypeChange}
              label="Action Type"
            >
              {ACTION_TYPES.map((actionType) => (
                <MenuItem key={actionType.value} value={actionType.value}>
                  {actionType.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Box sx={{ flexGrow: 1 }} />

          <IconButton color="error" onClick={onDelete} size="small">
            <DeleteIcon />
          </IconButton>
        </Stack>

        {params.length > 0 && (
          <Stack spacing={2}>
            {params.map((param) => (
              <TextField
                key={param.name}
                label={param.label}
                value={action.parameters?.[param.name] || ""}
                onChange={handleParameterChange(param.name)}
                type={param.type === "number" ? "number" : "text"}
                required={param.required}
                fullWidth
                multiline={param.type === "text" && param.name === "message"}
                rows={param.type === "text" && param.name === "message" ? 3 : 1}
                helperText={
                  param.name === "message"
                    ? "You can use variables like {player_name}, {kills}, {deaths}, etc."
                    : undefined
                }
              />
            ))}
          </Stack>
        )}

        {params.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            This action requires no additional parameters.
          </Typography>
        )}
      </Stack>
    </Paper>
  );
};

export default ActionBuilder;

