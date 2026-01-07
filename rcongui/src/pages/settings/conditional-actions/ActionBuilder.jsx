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
  Tooltip,
  Chip,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";

const ACTION_TYPES = [
  {
    value: "message_player",
    label: "Message Player",
    params: [{ name: "message", label: "Message", type: "text", required: true }],
  },
  {
    value: "message_all_players",
    label: "Message All Players",
    params: [{ name: "message", label: "Message", type: "text", required: true }],
  },
  {
    value: "kick_player",
    label: "Kick Player",
    params: [{ name: "reason", label: "Reason", type: "text", required: true }],
  },
  {
    value: "punish_player",
    label: "Punish Player",
    params: [{ name: "reason", label: "Reason", type: "text", required: true }],
  },
  {
    value: "temp_ban_player",
    label: "Temporary Ban Player",
    params: [
      { name: "reason", label: "Reason", type: "text", required: true },
      { name: "duration_hours", label: "Duration (hours)", type: "number", required: true, default: 2 },
    ],
  },
  {
    value: "perma_ban_player",
    label: "Permanent Ban Player",
    params: [{ name: "reason", label: "Reason", type: "text", required: true }],
  },
  {
    value: "add_player_flag",
    label: "Add Player Flag",
    params: [
      { name: "flag", label: "Flag", type: "text", required: true },
      { name: "comment", label: "Comment", type: "text", required: false },
    ],
  },
  {
    value: "remove_player_flag",
    label: "Remove Player Flag",
    params: [{ name: "flag", label: "Flag", type: "text", required: true }],
  },
  {
    value: "add_to_watchlist",
    label: "Add to Watchlist",
    params: [{ name: "reason", label: "Reason", type: "text", required: true }],
  },
  {
    value: "broadcast_message",
    label: "Set Broadcast Message",
    params: [{ name: "message", label: "Message", type: "text", required: true }],
  },
  {
    value: "temporary_broadcast",
    label: "Temporary Broadcast",
    params: [
      { name: "message", label: "Message", type: "text", required: true },
      { name: "duration_seconds", label: "Duration (seconds)", type: "number", required: true, default: 60 },
    ],
  },
  {
    value: "send_discord_webhook",
    label: "Send Discord Webhook",
    params: [
      { name: "webhook_url", label: "Webhook URL", type: "text", required: true },
      { name: "message", label: "Message", type: "text", required: true },
    ],
  },
  {
    value: "switch_player_team",
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
    <Paper
      variant="outlined"
      sx={{
        p: 2.5,
        borderRadius: 2,
        bgcolor: "background.default",
        '&:hover': {
          boxShadow: 2,
          borderColor: 'secondary.main',
        },
        transition: 'all 0.2s',
      }}
    >
      <Stack spacing={2.5}>
        <Stack direction="row" spacing={2} alignItems="center">
          <FormControl sx={{ minWidth: 280 }} size="small">
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

          {params.length > 0 && (
            <Chip
              label={`${params.length} parameter${params.length > 1 ? 's' : ''}`}
              size="small"
              color="info"
              variant="outlined"
            />
          )}

          <Box sx={{ flexGrow: 1 }} />

          <Tooltip title="Delete action">
            <IconButton
              color="error"
              onClick={onDelete}
              size="small"
              sx={{
                '&:hover': {
                  bgcolor: 'error.light',
                  color: 'error.contrastText',
                }
              }}
            >
              <DeleteIcon />
            </IconButton>
          </Tooltip>
        </Stack>

        {params.length > 0 && (
          <Stack spacing={2} sx={{ pl: 1 }}>
            {params.map((param) => (
              <TextField
                key={param.name}
                label={param.label}
                value={action.parameters?.[param.name] || ""}
                onChange={handleParameterChange(param.name)}
                type={param.type === "number" ? "number" : "text"}
                required={param.required}
                fullWidth
                size="small"
                multiline={param.type === "text" && param.name === "message"}
                rows={param.type === "text" && param.name === "message" ? 3 : 1}
                helperText={
                  param.name === "message"
                    ? "💡 You can use variables like {player_name}, {kills}, {deaths}, etc."
                    : undefined
                }
              />
            ))}
          </Stack>
        )}

        {params.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', pl: 1 }}>
            ℹ️ This action requires no additional parameters.
          </Typography>
        )}
      </Stack>
    </Paper>
  );
};

export default ActionBuilder;

