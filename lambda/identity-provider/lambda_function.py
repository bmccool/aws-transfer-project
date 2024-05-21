# GetUserConfig Python Lambda with LOGICAL HomeDirectoryDetails
import json

def lambda_handler(event, context):
  print("Username: {}, ServerId: {}, sourceIP: {}".format(event['username'], event['serverId'], event['sourceIp']))

  response = {}

  # Check if the username presented for authentication is correct. This doesn't check the value of the server ID, only that it is provided.
  if event['serverId'] != '' and event['username'] == 'ovc-camera':
    homeDirectoryDetails = [
      {
        'Entry': '/',
        'Target': '/sftp-server-data-bucket-654654585293-us-east-2'
      }
    ]
    response = {
      # BAM: This needs to be the ARN of the role the user will assume.  The account ID number needs to be matched to what our account ID is.
      # The role needs to have a permission policy that allows the user Limited: Read, List, Permissions management, Write to S3 bucket
      'Role': 'arn:aws:iam::654654585293:role/SftpAccessRole', # The user will be authenticated if and only if the Role field is not blank
      'HomeDirectoryDetails': json.dumps(homeDirectoryDetails),
      'HomeDirectoryType': "LOGICAL"
    }

    # Check if password is provided
    if event.get('password', '') == '':
      print("No password")
      # Return HTTP status 200 but with no role in the response to indicate authentication failure
      response = {}
    # Check if password is correct
    elif event['password'] != 'testpass1234':
      # Return HTTP status 200 but with no role in the response to indicate authentication failure
      print("Incorrect password")
      response = {}
  else:
    # Return HTTP status 200 but with no role in the response to indicate authentication failure
    print("Wrong Server or username")
    response = {}

  print("Response: {}".format(response))
  return response